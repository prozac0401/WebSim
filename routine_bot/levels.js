(function (root, factory) {
  const levels = factory();
  if (typeof module === 'object' && module.exports) module.exports = levels;
  else root.RoutineLevels = levels;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const basic = ['forward', 'left', 'right'];
  const loops = basic.concat('repeat');
  const timedLoops = loops.concat('wait');
  const wall = timedLoops.concat('if', 'blocked');
  const signs = wall.concat('mark');
  const oneFunction = signs.concat('call', 'F1');
  const all = oneFunction.concat('F2');
  return [
    { id: 1, title: '집 앞 세 걸음', chapter: 1, brief: '노란 화살표가 보는 쪽으로, 집까지 세 칸!',
      hints: ['로봇 코의 화살표는 오른쪽을 보고 있어요.', '앞으로 블록 하나는 한 칸만 움직여요.', '집까지의 바닥 칸을 손가락으로 짚어 보세요.'],
      unlocks: ['forward'], maxCommands: 3, maxSteps: 20,
      maps: [{ rows: ['#######', '#...H.#', '#######'], start: { x: 1, y: 1, dir: 1 } }] },
    { id: 2, title: '모퉁이 우체통', chapter: 1, brief: '길이 꺾이면 로봇도 제자리에서 방향을 바꿔요.',
      hints: ['처음에는 위쪽 길을 따라가요.', '회전 블록은 이동하지 않고 보는 방향만 바꿔요.', '모퉁이에서 집이 로봇의 어느 쪽인지 살펴보세요.'],
      unlocks: basic, maxCommands: 5, maxSteps: 30,
      maps: [{ rows: ['######', '#..H##', '#.####', '#.####', '######'], start: { x: 1, y: 3, dir: 0 } }] },
    { id: 3, title: '지그재그 골목', chapter: 1, brief: '왼쪽과 오른쪽은 로봇이 바라보는 쪽을 기준으로 해요.',
      hints: ['첫 갈림길에서 로봇이 위를 보려면 어느 쪽으로 돌아야 할까요?', '먼저 첫 모퉁이까지만 한 단계씩 실행해 보세요.', '두 번째 모퉁이에서는 첫 번째와 반대 방향으로 돌아요.'],
      unlocks: basic, maxCommands: 6, maxSteps: 35,
      maps: [{ rows: ['######', '##.H##', '##.###', '#..###', '######'], start: { x: 1, y: 3, dir: 1 } }] },
    { id: 4, title: '햇살 보도', chapter: 2, brief: '같은 발걸음은 반복 상자에 담아 보세요.',
      hints: ['똑같은 앞으로 블록이 여러 개 필요해 보여요.', '반복 블록 안에 넣은 명령은 정한 횟수만큼 다시 해요.', '펼쳐진 반복 가지의 ＋ 버튼으로 위치를 고르고, 필요한 발걸음을 넣어 보세요.'],
      unlocks: loops, maxCommands: 2, maxSteps: 40,
      maps: [{ rows: ['########', '#.....H#', '########'], start: { x: 1, y: 1, dir: 1 } }] },
    { id: 5, title: '통통 계단', chapter: 2, brief: '깜빡이는 계단! 첫 발걸음 전에 안전한 박자를 찾아요.',
      hints: ['위험 표식은 지금과 다음 박자에 켜질 칸을 알려줘요.', '이동·회전·기다리기는 한 박자예요. 시작 칸에서 잠깐 쉬면 첫 발걸음의 박자가 달라져요.', '계단 하나의 이동·회전 묶음을 찾고, 안전하게 출발한 뒤 같은 묶음을 반복해 보세요.'],
      unlocks: timedLoops, maxCommands: 6, maxSteps: 60,
      maps: [{ rows: ['######', '#..###', '##..##', '###..#', '####H#', '######'], start: { x: 1, y: 1, dir: 1 },
        hazards: [{ x: 2, y: 1, period: 4, activePhases: [0, 1] }, { x: 3, y: 2, period: 4, activePhases: [0, 1] }, { x: 4, y: 3, period: 4, activePhases: [0, 1] }] }] },
    { id: 6, title: '보폭이 다른 언덕', chapter: 2, brief: '가로와 세로의 리듬이 달라요. 반복 안에 작은 반복도 넣어 보세요.',
      hints: ['가로 길과 세로 길의 길이를 각각 세어 보세요.', '긴 걸음, 회전, 짧은 걸음, 회전이 한 묶음이에요.', '큰 반복의 안쪽에서 가로와 세로 걸음을 각각 작은 반복으로 줄일 수 있어요.'],
      unlocks: timedLoops, maxCommands: 7, maxSteps: 100,
      maps: [{ rows: ['############', '#....#######', '####.#######', '####....####', '#######.####', '#######....#', '##########.#', '##########H#', '############'], start: { x: 1, y: 1, dir: 1 } }] },
    { id: 7, title: '벽이 길잡이', chapter: 3, brief: '앞이 막혔을 때와 열렸을 때, 다른 명령을 골라요.',
      hints: ['모퉁이에 도착하면 앞이 벽이 되는 순간이 있어요.', '조건 상자는 지금 상태를 보고 예 또는 아니요 중 하나만 골라요.', '앞이 막힌 순간의 행동과, 길이 열린 순간의 행동을 서로 다른 칸에 넣어 보세요.'],
      unlocks: wall, maxCommands: 4, maxSteps: 80,
      maps: [{ rows: ['#######', '#.....#', '#####.#', '##H...#', '#######'], start: { x: 1, y: 1, dir: 1 } }] },
    { id: 8, title: '별빛 표지판', chapter: 3, brief: '별을 읽고 쉬는 순간을 골라, 깜빡이는 길을 건너요.',
      hints: ['별은 다음 칸이 아니라 지금 서 있는 칸의 표식이에요.', '별에서 방향을 바꾸는 동안에도 시간이 가요. 그 다음 위험칸의 박자를 살펴보세요.', '별에서만 잠깐 쉬는 동작을 조건에 담을 수 있어요. 방향을 고른 뒤에는 별에서 벗어나야 해요.'],
      unlocks: signs, maxCommands: 5, maxSteps: 80,
      maps: [{ rows: ['######', '#..*.#', '###.##', '#H.*##', '###.##', '######'], start: { x: 1, y: 1, dir: 1 },
        hazards: [{ x: 3, y: 2, period: 3, activePhases: [1] }, { x: 2, y: 3, period: 4, activePhases: [3] }] }] },
    { id: 9, title: '갈림길의 약속', chapter: 3, brief: '벽과 별은 서로 다른 안내예요. 무엇을 먼저 볼까요?',
      hints: ['별에서 가던 방향으로 더 가면 막다른 짧은 길이에요.', '앞이 벽인 모퉁이와 별이 있는 모퉁이에서 돌아야 하는 쪽이 달라요.', '한 조건의 아니요 안에 다른 조건을 넣으면 벽, 별, 보통 길을 나누어 볼 수 있어요.'],
      unlocks: signs, maxCommands: 6, maxSteps: 110,
      maps: [{ rows: ['########', '#####H##', '#####.##', '###..*.#', '###.####', '#..*.###', '########'], start: { x: 1, y: 5, dir: 1 } }] },
    { id: 10, title: '택배 동작 F1', chapter: 4, brief: '자주 쓰는 동작에 F1이라는 이름을 붙여 두고 다시 불러요.',
      hints: ['양쪽 언덕의 작은 계단은 방향이 달라도 같은 동작으로 넘을 수 있어요.', 'F1 보관함에는 동작 묶음을, 출발 프로그램에는 F1 부르기를 넣어요.', '함수가 끝나면 부른 곳 바로 다음 명령으로 돌아와요. 두 언덕 사이의 다리는 따로 살펴보세요.'],
      unlocks: oneFunction, maxCommands: 11, maxSteps: 110,
      maps: [{ rows: ['#########', '#..###.H#', '##..#..##', '###...###', '#########'], start: { x: 1, y: 1, dir: 1 } }] },
    { id: 11, title: '동작을 부르는 동작', chapter: 4, brief: 'F2 안에서 F1을 불러, 작은 동작으로 큰 동작을 만들어요.',
      hints: ['두 칸 걷는 짧은 동작이 여러 곳에서 보여요.', '한 함수에 짧은 걸음을, 다른 함수에 걸음과 모퉁이를 묶어 볼 수 있어요.', '함수에서 돌아올 때의 방향까지 확인하세요. 가운데 다리 한 칸은 묶음 밖에 있어요.'],
      unlocks: all, maxCommands: 9, maxSteps: 130,
      maps: [{ rows: ['########', '#...####', '###.####', '###....#', '######.#', '######H#', '########'], start: { x: 1, y: 1, dir: 1 } }] },
    { id: 12, title: '길이가 달라도 같은 약속', chapter: 4, brief: '두 동네의 위험 박자까지 읽는 하나의 동작을 만들어 보세요.',
      hints: ['지도마다 길의 길이와 위험칸의 위치가 달라요. 두 지도를 미리 살펴보세요.', '앞이 막혔을 때의 회전과, 길이 열렸을 때의 걸음을 구분해 보세요.', '안전하게 쉬고 걷는 짧은 동작을 함수에 담으면, 다른 길에서도 같은 박자로 다시 쓸 수 있어요.'],
      unlocks: all, maxCommands: 7, maxSteps: 150,
      maps: [
        { rows: ['#######', '#.....#', '#####.#', '##H...#', '#######'], start: { x: 1, y: 1, dir: 1 },
          hazards: [{ x: 3, y: 1, period: 4, activePhases: [2] }] },
        { rows: ['#####', '#...#', '###.#', '###.#', '###.#', '##H.#', '#####'], start: { x: 1, y: 1, dir: 1 },
          hazards: [{ x: 3, y: 1, period: 4, activePhases: [3] }] }
      ] },
    { id: 13, title: '응용 · 별 사이 먼 길', chapter: 5, brief: '벽과 별을 읽는 동작을 묶어, 서로 다른 간격의 골목을 지나세요.',
      hints: ['한 번의 실행으로 끝까지 가기 전에 첫 별과 첫 벽의 판단을 확인해 보세요.', '별에서 회전한 뒤 같은 자리에서 다시 판단하면 어떤 일이 생길까요?', '판단과 이동을 한 동작으로 묶고, 필요한 만큼 여러 번 불러 보세요.'],
      unlocks: all, maxCommands: 9, maxSteps: 220,
      maps: [{ rows: ['###########', '###########', '#######..H#', '#######.###', '#######.###', '####...*.##', '####.######', '#...*.#####', '###########'], start: { x: 1, y: 7, dir: 1 } }] },
    { id: 14, title: '응용 · 별자리의 두 보폭', chapter: 5, brief: '별에서는 계단 동작, 보통 길에서는 긴 걸음. 두 함수를 골라 불러요.',
      hints: ['별에서 다음 별까지는 계단과 직선 구간이 번갈아 나와요.', '별이 있는지 확인한 뒤 두 종류의 동작 중 하나를 골라 보세요.', '각 함수는 다음 판단을 할 위치에서 끝나야 해요. 함수에서 나온 직후의 위치를 살펴보세요.'],
      unlocks: all, maxCommands: 10, maxSteps: 180,
      maps: [{ rows: ['############', '#*.#########', '##..*.######', '#####..*.###', '########..H#', '############'], start: { x: 1, y: 1, dir: 1 } }] },
    { id: 15, title: '응용 · 어느 길에서도 집으로', chapter: 5, brief: '세 방향, 서로 다른 위험 박자. 쉬고 걷는 동작도 함수로 묶어요.',
      hints: ['첫 위험칸에서 한 박자만 쉬었을 때와 두 박자 쉬었을 때를 비교해 보세요.', '한 번 안전하게 건넜더라도 다음 위험칸의 박자는 다를 수 있어요. 함수가 같은 리듬을 유지하게 해 보세요.', '벽·별 판단과 쉬고 걷는 동작을 나누어 두 함수에 담고, 세 지도에서 같은 코드를 시험해 보세요.'],
      unlocks: all, maxCommands: 11, maxSteps: 280,
      maps: [
        { rows: ['##########', '######..H#', '######.###', '######.###', '###...*.##', '###.######', '#..*.#####', '##########'], start: { x: 1, y: 6, dir: 1 },
          hazards: [{ x: 2, y: 6, period: 6, activePhases: [1, 2] }, { x: 4, y: 4, period: 6, activePhases: [3, 4] }] },
        { rows: ['##########', '#######H##', '####...*.#', '####.#####', '#...*.####', '#.########', '#.########', '#.########', '##########'], start: { x: 1, y: 7, dir: 0 },
          hazards: [{ x: 1, y: 6, period: 6, activePhases: [1, 2] }, { x: 3, y: 4, period: 6, activePhases: [2, 3] }] },
        { rows: ['############', '######.*...#', '#######.####', '###.*...####', '####.#######', '####.#######', '##H..#######', '############'], start: { x: 10, y: 1, dir: 3 },
          hazards: [{ x: 9, y: 1, period: 6, activePhases: [1, 2] }, { x: 8, y: 1, period: 6, activePhases: [4, 5] }] }
      ] }
  ];
});
