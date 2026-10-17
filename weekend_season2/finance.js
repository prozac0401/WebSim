(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./calendar.js') : root.S2Calendar);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.S2Finance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const ORDER = '수입 → 당월 필수 고정비 → 밀린 고정비 → 카드 미납 정산 → 활동 거래 → 월말 카드 정산 → 요약';
  function won(value, fallback) {
    const number = value === undefined ? (fallback || 0) : value;
    if (!Number.isSafeInteger(number) || number < 0) throw new RangeError('금액은 0 이상의 원화 정수여야 합니다.');
    return number;
  }
  function housingCosts(config) {
    const c = config || {}, tenure = c.housingTenure === undefined ? 'unspecified' : c.housingTenure;
    if (!['own', 'rent', 'jeonse', 'unspecified'].includes(tenure)) throw new RangeError('주거 계약 형태를 확인하세요.');
    const monthlyRent = won(c.monthlyRent), principal = won(c.housingLoanPrincipal), rateBps = c.housingLoanRateBps === undefined ? 0 : c.housingLoanRateBps;
    if (principal > 10000000000) throw new RangeError('주거 대출 원금은 100억원 이하여야 합니다.');
    if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 3000) throw new RangeError('주거 대출 연이율은 0~30% 범위여야 합니다.');
    // Legacy, unspecified housing adds no new expense or inferred debt.
    const loanPrincipal = tenure === 'unspecified' ? 0 : principal;
    const appliedRate = tenure === 'unspecified' ? 0 : rateBps;
    const rent = tenure === 'rent' ? monthlyRent : 0;
    const maintenanceValue = won(c.housingMaintenance);
    const maintenance = tenure === 'unspecified' ? 0 : maintenanceValue;
    // The bounded integer product is exact; only the monthly won amount rounds.
    const interest = Math.round(loanPrincipal * appliedRate / 120000);
    return { tenure, rent, interest, maintenance, total: won(rent + interest + maintenance), loanPrincipal, rateBps: appliedRate };
  }
  function monthlyCosts(config) {
    const c = config || {}, housing = housingCosts(c), living = won(c.fixedCosts);
    return { living, housing: housing.total, rent: housing.rent, interest: housing.interest, maintenance: housing.maintenance, total: won(living + housing.total) };
  }
  function configValues(config) {
    const c = config || {};
    const payDay = c.payDay === undefined ? 1 : c.payDay;
    if (!Number.isInteger(payDay) || payDay < 1 || payDay > 31) throw new RangeError('급여일은 1~31일이어야 합니다.');
    return { salary: won(c.salary), externalAllowance: won(c.externalAllowance), fixedCosts: won(c.fixedCosts), payDay,
      cardLimit: won(c.cardLimit, 1000000), personalBudget: c.personalBudget === undefined ? Number.MAX_SAFE_INTEGER : won(c.personalBudget),
      housing: housingCosts(c), monthly: monthlyCosts(c) };
  }
  function create(config) {
    configValues(config);
    return { cash: won((config || {}).startCash), cardPending: 0, arrears: 0, fixedArrears: 0, pendingPay: 0,
      pendingRewards: [], ledger: [], processed: {}, currentDate: null, monthKey: null, monthSpent: 0 };
  }
  function entry(f, date, type, amount, label, fields) {
    const item = Object.assign({ id: 'tx-' + (f.ledger.length + 1), date, type, amount, label,
      method: '', income: 0, consumption: 0, paid: 0, cause: '' }, fields || {});
    f.ledger.push(item);
    return item;
  }
  function payDate(date, c) {
    const last = C.daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
    return date.slice(0, 8) + String(Math.min(c.payDay, last)).padStart(2, '0');
  }
  function projection(f, config) {
    const c = configValues(config);
    const date = f.currentDate;
    let incoming = 0;
    // Only income already earned or scheduled within this month is counted.
    // Future activities and their possible rewards are never assumed.
    if (date && date < payDate(date, c)) {
      incoming = c.salary + c.externalAllowance + f.pendingRewards.filter(r => r.kind !== 'sidejob' && r.earnedDate < payDate(date, c)).reduce((sum, r) => sum + r.amount, 0);
    }
    if (date) incoming += f.pendingRewards.filter(r => r.kind === 'sidejob' && r.dueDate > date && r.dueDate.slice(0,7) === date.slice(0,7)).reduce((sum,r) => sum+r.amount,0);
    const unpaidCurrentFixed = !date || !f.processed['fixed:' + date.slice(0, 7)] ? c.monthly.total : 0;
    return { c, income: incoming, spendable: Math.max(0, f.cash + incoming - f.cardPending - f.arrears - f.fixedArrears - unpaidCurrentFixed), budget: Math.max(0, c.personalBudget - f.monthSpent) };
  }
  function available(f, config) { const p = projection(f, config); return Math.min(p.spendable, p.budget); }
  function canSpend(f, amount, method, config) {
    if (!Number.isSafeInteger(amount) || amount < 0) return { ok: false, reason: '금액은 원화 정수여야 합니다.', cause: 'invalid' };
    if (!['cash', 'card', 'debit'].includes(method)) return { ok: false, reason: '결제 수단을 확인하세요.', cause: 'invalid' };
    if (amount === 0) return { ok: true, reason: '', cause: '' };
    const p = projection(f, config);
    if (amount > p.budget) return { ok: false, reason: '이번 달 개인 지출 예산이 부족합니다. 무료 활동이나 다음 달 일정을 선택할 수 있습니다.', cause: 'budget' };
    if (method === 'card' && (f.arrears > 0 || f.fixedArrears > 0)) return { ok: false, reason: '미납이 있어 새 카드 사용이 제한됩니다. 무료 활동은 계속할 수 있습니다.', cause: 'arrears' };
    if (method === 'card' && f.cardPending + amount > p.c.cardLimit) return { ok: false, reason: '게임 내 카드 한도를 넘습니다.', cause: 'card-limit' };
    if (method !== 'card' && amount > f.cash) return { ok: false, reason: '즉시 지불할 현금이 부족합니다.', cause: 'cash' };
    if (amount > p.spendable) return { ok: false, reason: '예정 청구액과 필수비용을 제외한 가용예산이 부족합니다.', cause: 'money' };
    return { ok: true, reason: '', cause: '' };
  }
  function spend(f, date, amount, method, label, config) {
    if (!C.validDate(date)) throw new RangeError('거래 날짜를 확인하세요.');
    if (f.processed['end:' + date]) return { ok: false, reason: '이미 정산된 날짜입니다.', cause: 'closed-day' };
    const check = canSpend(f, amount, method, config);
    if (!check.ok) return check;
    if (method === 'card') f.cardPending += amount;
    else f.cash -= amount;
    f.monthSpent += amount;
    return { ok: true, reason: '', entry: entry(f, date, 'purchase', amount, label, { method, consumption: amount, paid: method === 'card' ? 0 : amount, cause: 'chosen' }) };
  }
  function settleOldDebt(f, date) {
    if (f.fixedArrears > 0 && f.cash > 0) {
      const paid = Math.min(f.cash, f.fixedArrears);
      f.cash -= paid; f.fixedArrears -= paid;
      entry(f, date, 'fixed-arrears-payment', paid, '밀린 필수 고정비 납부', { method: 'cash', paid, cause: 'unavoidable' });
    }
    if (f.arrears > 0 && f.cash > 0) {
      const paid = Math.min(f.cash, f.arrears);
      f.cash -= paid; f.arrears -= paid;
      entry(f, date, 'arrears-payment', paid, '카드 미납 정산', { method: 'cash', paid, cause: 'settlement' });
    }
  }
  function beginDay(f, date, config) {
    if (!C.validDate(date)) throw new RangeError('정산 날짜를 확인하세요.');
    if (f.processed['begin:' + date]) return [];
    if (f.currentDate && date < f.currentDate) throw new RangeError('장부 날짜를 거꾸로 진행할 수 없습니다.');
    const c = configValues(config), before = f.ledger.length;
    f.currentDate = date;
    if (f.monthKey !== date.slice(0, 7)) { f.monthKey = date.slice(0, 7); f.monthSpent = 0; }
    f.processed['begin:' + date] = true;
    let income = 0;
    if (date === payDate(date, c)) {
      if (c.salary) { f.cash += c.salary; income += c.salary; entry(f, date, 'salary', c.salary, '급여', { income: c.salary }); }
      if (c.externalAllowance) { f.cash += c.externalAllowance; income += c.externalAllowance; entry(f, date, 'allowance', c.externalAllowance, config.economicProfile ? '가계 지원·분담금' : '외부에서 받은 용돈', { income: c.externalAllowance }); }
    }
    const isDue = reward => reward.kind === 'sidejob' ? reward.dueDate <= date : date === payDate(date,c) && reward.earnedDate < date;
    const due = f.pendingRewards.filter(isDue);
    f.pendingRewards = f.pendingRewards.filter(reward => !isDue(reward));
    for (const reward of due) {
      f.cash += reward.amount; income += reward.amount; f.pendingPay -= reward.amount;
      entry(f, date, 'extra-pay', reward.amount, reward.label, { income: reward.amount, earnedDate: reward.earnedDate,
        ...(reward.kind === 'sidejob' ? {kind:'sidejob',reference:reward.reference,dueDate:reward.dueDate,cause:'sidejob'} : {}) });
    }
    if (date.slice(8) === '01' && !f.processed['fixed:' + date.slice(0, 7)]) {
      f.processed['fixed:' + date.slice(0, 7)] = true;
      const paid = Math.min(f.cash, c.monthly.total), unpaid = c.monthly.total - paid;
      f.cash -= paid; f.fixedArrears += unpaid;
      entry(f, date, 'fixed-cost', c.monthly.total, '이번 달 필수 고정비', { method: 'cash', consumption: c.monthly.total, paid, unpaid, cause: 'unavoidable',
        livingCosts: c.monthly.living, rent: c.monthly.rent, loanInterest: c.monthly.interest, ...(c.housing.maintenance ? {housingMaintenance:c.housing.maintenance} : {}), housingTenure: c.housing.tenure,
        loanPrincipal: c.housing.loanPrincipal, housingLoanRateBps: c.housing.rateBps });
      if (unpaid) entry(f, date, 'fixed-unpaid', unpaid, '필수 고정비 미납 기록', { cause: 'unavoidable' });
    }
    // Housing principal never creates cash or auto-repayment. Income covers
    // current rent/interest and living costs before old essentials and card debt.
    if (income > 0) settleOldDebt(f, date);
    return f.ledger.slice(before);
  }
  function endDay(f, date, config) {
    if (!C.validDate(date)) throw new RangeError('정산 날짜를 확인하세요.');
    if (f.processed['end:' + date]) return [];
    if (!f.processed['begin:' + date]) throw new Error('수입·고정비 처리를 먼저 실행하세요.');
    configValues(config);
    const before = f.ledger.length;
    f.processed['end:' + date] = true;
    if (C.monthEnd(date)) {
      const bill = f.cardPending, paid = Math.min(f.cash, bill), unpaid = bill - paid;
      f.cash -= paid; f.cardPending = 0; f.arrears += unpaid;
      entry(f, date, 'card-payment', bill, '월말 카드 정산', { method: 'cash', paid, unpaid, cause: 'settlement' });
      if (unpaid) entry(f, date, 'card-unpaid', unpaid, '카드 미납 기록 · 새 카드 사용 제한', { cause: 'money' });
    }
    return f.ledger.slice(before);
  }
  function addPendingPay(f, date, amount, label) {
    if (!C.validDate(date)) throw new RangeError('보상 발생일을 확인하세요.');
    won(amount);
    f.pendingPay += amount;
    f.pendingRewards.push({ earnedDate: date, amount, label: label || '추가근무 보상' });
    return entry(f, date, 'pending-pay', amount, label || '다음 급여일 지급 예정', { cause: 'earned' });
  }
  // A side job earns money during an activity. It is paid at the next day's
  // income stage, ahead of fixed costs and debt, rather than injecting cash
  // between today's activity and card-settlement stages. References survive
  // payout in the ledger, so retrying a completed activity never pays twice.
  function addEarnedPay(f, date, amount, label, options) {
    const reference=options&&options.reference, name=label===undefined?'부업 보상':label;
    const fail=(reason,cause)=>({ok:false,reason,cause});
    if(!C.validDate(date)||!Number.isSafeInteger(amount)||amount<0||typeof name!=='string'||!name.length||name.length>200||typeof reference!=='string'||!reference.trim()||reference.length>160)return fail('부업 보상의 날짜·금액·이름·고유 기록을 확인하세요.','invalid');
    const previous=f.ledger.find(t=>t.type==='pending-pay'&&t.reference===reference);
    if(previous){
      if(previous.kind!=='sidejob'||previous.date!==date||previous.amount!==amount||previous.label!==name)return fail('같은 부업 기록에 서로 다른 보상을 등록할 수 없습니다.','reference-conflict');
      return {ok:true,duplicate:true,entry:previous};
    }
    if(f.processed['end:'+date])return fail('이미 정산된 날짜입니다.','closed-day');
    if(f.currentDate!==date||!f.processed['begin:'+date])return fail('그날 수입과 고정비를 먼저 처리하세요.','unopened-day');
    const reward={earnedDate:date,amount,label:name,dueDate:C.addDays(date,1),kind:'sidejob',reference};
    f.pendingPay+=amount;f.pendingRewards.push(reward);
    const transaction=entry(f,date,'pending-pay',amount,name,{cause:'sidejob',kind:'sidejob',reference,earnedDate:date,dueDate:reward.dueDate});
    return {ok:true,duplicate:false,entry:transaction,reward};
  }
  function summary(f, config) {
    const sum = field => f.ledger.reduce((value, item) => value + (item[field] || 0), 0);
    const housingRent = f.ledger.reduce((value, item) => value + (item.type === 'fixed-cost' ? item.rent || 0 : 0), 0);
    const housingInterest = f.ledger.reduce((value, item) => value + (item.type === 'fixed-cost' ? item.loanInterest || 0 : 0), 0);
    const housingMaintenance = f.ledger.reduce((value, item) => value + (item.type === 'fixed-cost' ? item.housingMaintenance || 0 : 0), 0);
    const housingLoanPrincipal = housingCosts(config).loanPrincipal, unpaidDebt = f.cardPending + f.arrears + f.fixedArrears;
    return { income: sum('income'), consumption: sum('consumption'), paid: sum('paid'), cash: f.cash,
      debt: unpaidDebt + housingLoanPrincipal, pendingPay: f.pendingPay, housingRent, housingInterest,
      housingCosts: housingRent + housingInterest + housingMaintenance, housingMaintenance, housingLoanPrincipal, unpaidDebt };
  }
  return { create, housingCosts, monthlyCosts, available, canSpend, spend, beginDay, endDay, addPendingPay, addEarnedPay, summary, ORDER };
});
