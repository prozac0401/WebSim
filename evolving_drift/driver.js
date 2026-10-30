/* State-feedback driver. Genes describe pedal feedforward and physical targets;
 * vehicle position, velocity and tyre forces are changed only by physics.step.
 * Fixed controller coefficients are model choices, not vehicle performance gains. */
(function (root) {
  'use strict';
  const Genome = root.DriftGenome || (typeof require === 'function' ? require('./genome.js') : null);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const wrap = x => Math.atan2(Math.sin(x), Math.cos(x));
  const DEG = Math.PI / 180;
  const TELEMETRY = Object.freeze(['targetSlip', 'lineOffset', 'counterLead', 'driveSlipTarget',
    'requestedGear', 'driverSteerCorrection', 'driverThrottleCorrection', 'targetYawRate',
    'pathError', 'predictedSlip', 'clutchEventIndex', 'clutchEventStart',
    'clutchEventOpenSec', 'clutchEventCloseSec', 'clutchKickCount', 'clutchKickActive']);

  function initialClutchState() {
    return { clutchEventIndex: -1, clutchEventStart: -1, clutchEventOpenSec: 0,
      clutchEventCloseSec: 0, clutchKickCount: 0, clutchKickActive: 0 };
  }

  function clutchCommand(vehicle, track, state, gene) {
    const p=vehicle.physics||vehicle;
    if ((p.transmissionType||vehicle.profile?.transmissionType)!=='MT' || !Number.isFinite(state.time))
      return { ...initialClutchState(), clutch: 0 };
    const out=initialClutchState();
    for(const key of Object.keys(out))if(Number.isFinite(state[key]))out[key]=state[key];
    const knot=Math.floor(clamp(state.s/track.length,0,1)*(Genome.KNOTS-1));
    const end=out.clutchEventStart+out.clutchEventOpenSec+out.clutchEventCloseSec;
    const available=out.clutchEventStart<0 || state.time>=end+.20;
    // Only crossed knots can fire. Mark every crossed knot consumed even while
    // another event is active; nothing is queued for a later accidental kick.
    if(available)for(let i=Math.max(0,out.clutchEventIndex+1);i<=knot;i++){
      const at=i*Genome.STRIDE;
      if(gene[at+Genome.CHANNELS.clutchKick]<.5)continue;
      out.clutchEventStart=state.time;
      out.clutchEventOpenSec=clamp(gene[at+Genome.CHANNELS.disengageSec],.04,.45);
      out.clutchEventCloseSec=clamp(gene[at+Genome.CHANNELS.reengageSec],.03,.30);
      out.clutchKickCount++;
      break;
    }
    out.clutchEventIndex=Math.max(out.clutchEventIndex,knot);
    const elapsed=state.time-out.clutchEventStart;
    out.clutchKickActive=out.clutchEventStart>=0&&elapsed<out.clutchEventOpenSec+out.clutchEventCloseSec?1:0;
    const clutch=!out.clutchKickActive?0:elapsed<out.clutchEventOpenSec?1:
      clamp(1-(elapsed-out.clutchEventOpenSec)/out.clutchEventCloseSec,0,1);
    return { ...out, clutch };
  }

  function reference(track, gene, s) {
    s = clamp(s, 0, track.length);
    const road = track.sample(s), target = Genome.sample(gene, s, track.length);
    return { x: road.x - Math.sin(road.heading) * target.lineOffset,
      y: road.y + Math.cos(road.heading) * target.lineOffset, heading: road.heading };
  }

  function command(vehicle, track, state, gene) {
    if (!Genome) throw new Error('Load DriftGenome before DriftDriver.');
    const p = vehicle.physics || vehicle;
    const target = Genome.sample(gene, state.s, track.length);
    const speed = Math.hypot(state.vx, state.vy);
    const beta = speed > 1 ? wrap(Math.atan2(state.vy, state.vx) - state.yaw) : 0;
    const velocityHeading = speed > 1 ? state.yaw + beta : state.yaw;
    const look = clamp(5 + speed * .48, 6, 16);
    const here = reference(track, gene, state.s);
    const ahead = reference(track, gene, state.s + look);
    const before = reference(track, gene, state.s - 1);
    const after = reference(track, gene, state.s + 1);
    const tangent = Math.hypot(after.x - before.x, after.y - before.y) > .01
      ? Math.atan2(after.y - before.y, after.x - before.x) : here.heading;
    const actualDistance = Math.max(2, Math.hypot(ahead.x - state.x, ahead.y - state.y));
    const referenceDistance = Math.max(2, Math.hypot(ahead.x - here.x, ahead.y - here.y));
    const pursuit = 2 * Math.sin(wrap(Math.atan2(ahead.y - state.y, ahead.x - state.x) - velocityHeading)) / actualDistance;
    const referenceCurvature = 2 * Math.sin(wrap(Math.atan2(ahead.y - here.y, ahead.x - here.x) - tangent)) / referenceDistance;
    // Subtract the on-path demand: the stored steer already supplies the grip
    // feedforward. Adding a second complete pursuit command would double it.
    const pathCorrection = clamp(Math.atan(p.wheelbaseM * pursuit) - Math.atan(p.wheelbaseM * referenceCurvature), -.35, .35);
    const targetYawRate = speed * pursuit;
    const slipRate = speed > 2 ? ((state.ay || 0) * Math.cos(beta) - (state.ax || 0) * Math.sin(beta)) / speed - state.r : 0;
    const predictedSlip = wrap(beta + target.counterLead * clamp(slipRate, -2.5, 2.5));
    const driftWeight = clamp(Math.abs(target.targetSlip) / (8 * DEG), 0, 1);
    // Returning the target to grip must not remove countersteering while the
    // body is still sliding. Blend in the measured attitude above the normal
    // grip range; this changes the driver's steering, never the vehicle pose.
    const actualPhase = clamp((Math.abs(beta) - 8 * DEG) / (12 * DEG), 0, 1);
    const actualWeight = actualPhase * actualPhase * (3 - 2 * actualPhase);
    const stabilizationWeight = Math.max(driftWeight, actualWeight);
    const errorWeight = Math.max(clamp(Math.abs(target.targetSlip) / DEG, 0, 1), actualWeight);
    // Natural grip cornering has a small body sideslip. The zero-drift target
    // tolerates that range. Only the final degree of target release blends the
    // deadzone, avoiding a discontinuity at zero without weakening drift input.
    const rawError = wrap(predictedSlip - target.targetSlip);
    const neutralError = Math.sign(rawError) * Math.max(0, Math.abs(rawError) - 5 * DEG);
    const slipError = errorWeight >= 1 ? rawError : errorWeight <= 0 ? neutralError
      : neutralError + (rawError - neutralError) * errorWeight;
    const yawCorrection = clamp(.14 * (targetYawRate - state.r), -.18, .18);
    const correction = pathCorrection + stabilizationWeight * beta + .8 * slipError + yawCorrection;
    const steer = clamp(target.steer + correction, -p.maxSteer, p.maxSteer);
    const pathError = (state.x - here.x) * -Math.sin(tangent) + (state.y - here.y) * Math.cos(tangent);

    const actualDriveSlip = Math.max(0, ((state.wheelSlip?.[2] || 0) + (state.wheelSlip?.[3] || 0)) / 2);
    let throttle = target.throttle;
    if (target.driveSlip > 0) throttle += 2 * (target.driveSlip - actualDriveSlip);
    // Release power when the requested attitude is being exceeded. This is a
    // pedal action, not extra tyre grip, automatic braking or a yaw impulse.
    const excessSlip = Math.max(0, Math.abs(predictedSlip) - Math.abs(target.targetSlip) - 7 * DEG);
    const lateralDemand = speed * speed * Math.abs(pursuit) / (9.81 * (p.gripCoefficient || 1));
    const lineRelease = clamp(1 - .16 * Math.max(0, Math.abs(pathError) - 1)
      - driftWeight * .8 * Math.max(0, lateralDemand - .85), 0, 1);
    const release = clamp(1 - excessSlip / (24 * DEG), 0, 1) * lineRelease;
    throttle = clamp(throttle, 0, 1) * release;
    const gearHold = p.electric ? 1 : clamp(Math.round(target.gearHold), 0, p.gearRatios.length);
    return { steer, throttle, brake: target.brake, gearHold, ...clutchCommand(vehicle, track, state, gene),
      targetSlip: target.targetSlip, lineOffset: target.lineOffset, counterLead: target.counterLead,
      driveSlipTarget: target.driveSlip, requestedGear: gearHold,
      driverSteerCorrection: steer - target.steer,
      driverThrottleCorrection: throttle - target.throttle,
      targetYawRate, pathError, predictedSlip };
  }

  function signature() {
    return [DEG, TELEMETRY.join(','), ...[clamp, wrap, initialClutchState, clutchCommand, reference, command].map(String)].join('\n').replace(/\r\n/g, '\n');
  }
  const api = { command, signature, TELEMETRY, initialClutchState, clutchCommand };
  root.DriftDriver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
