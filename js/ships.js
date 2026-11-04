/* Orbital Declaration — hull classes. Numbers are game data in SI units. */
(function () {
  'use strict';
  const OD = window.OD;

  // Mount records are game data consumed by the optional engagement module.
  const beam = (name, power, aperture, wavelength, arc) => ({ kind: 'beam', name, power, efficiency: 0.35, aperture, wavelength, arc });
  const coil = (name, muzzleVelocity, slugMass, cycle, magazine) => ({ kind: 'coilgun', name, muzzleVelocity, slugMass, cycle, magazine, heatPerShot: 0.15 * 0.5 * slugMass * muzzleVelocity * muzzleVelocity });
  const bay = (name, count, dryMass, propMass, ve, accel) => ({ kind: 'launcher', name, count, interceptor: { dryMass, propMass, exhaustVelocity: ve, accel } });
  const pd = (name, power, aperture) => ({ kind: 'pd', name, power, efficiency: 0.3, aperture, wavelength: 532e-9 });

  // Sensors: sensorRange is the passive sensitivity S (a solution at R_sol = S·√(P / 1 MW)); activeRange is how
  // far the active sensor pins a target outright, at the price of announcing the ship to everyone.
  // Radiators: radiatorArea is sized so that full fire — idle heat, the drive at full throttle and every beam
  // mount at its rated power less its efficiency — beats what the panels can shed at radiatorTemp by 15 to 20 %,
  // so a warship fighting flat out fills her sink instead of shrugging the heat off. The panels only reach that
  // rating once the sink passes the knee (physics.js: T = 290 K + min(1, load / SINK_KNEE) · (radiatorTemp − 290 K)), so the drive alone settles a
  // warship near 60 % of her sink and full fire on top of the burn fills it in 16 to 22 min.
  const ROLE_ZH = { corvette: '护卫艇', frigate: '护卫舰', destroyer: '驱逐舰', cruiser: '巡洋舰', lancer: '拦截母舰', freighter: '货船', tanker: '油轮', liner: '客船', station: '空间站', 'missile boat': '导弹艇' };
  const roleName = (c) => ROLE_ZH[(c && c.role) || c] || (c && c.role) || c || '';

  const CLASSES = {
    corvette: {
      id: 'corvette', name: '红隼级护卫艇', hull: 'Kestrel', role: 'corvette', length: 70,
      dryMass: 900e3, propMass: 1400e3, exhaustVelocity: 55e3, thrust: 30e6,
      angAccel: 0.03, maxAngVel: 0.25,
      reactorPower: 60e6, idleHeat: 2e6, driveHeat: 30e6, sinkCapacity: 15e9, radiatorArea: 330, radiatorTemp: 1000, radiatorDeployTime: 25,
      sensorRange: 250e3, activeRange: 800e3,
      armour: { nose: 20, flank: 8, tail: 4 },
      mounts: [beam('轴射激光', 12e6, 1.0, 1064e-9, 'nose'), coil('线圈炮', 4000, 5, 6, 90), bay('拦截弹发射舱', 6, 150, 250, 8000, 60), pd('点防御激光', 2e6, 0.3)],
      doctrine: { range: 250e3, jink: true },
      blurb: '快速哨戒舰体。一门轴射激光、一门线圈炮、六枚拦截弹。舷侧装甲 8 厘米，舰首 20 厘米。',
      advice: '始终把舰首朝向威胁。',
    },
    frigate: {
      id: 'frigate', name: '战戟级护卫舰', hull: 'Halberd', role: 'frigate', length: 120,
      dryMass: 2400e3, propMass: 3200e3, exhaustVelocity: 55e3, thrust: 60e6,
      angAccel: 0.015, maxAngVel: 0.18,
      reactorPower: 120e6, idleHeat: 4e6, driveHeat: 55e6, sinkCapacity: 30e9, radiatorArea: 600, radiatorTemp: 1000, radiatorDeployTime: 35,
      sensorRange: 300e3, activeRange: 1000e3,
      armour: { nose: 30, flank: 12, tail: 6 },
      mounts: [beam('激光炮塔 A', 10e6, 0.9, 1064e-9, 'turret'), beam('激光炮塔 B', 10e6, 0.9, 1064e-9, 'turret'), coil('线圈炮', 4000, 8, 7, 120), bay('拦截弹发射舱', 12, 150, 250, 8000, 60), pd('点防御激光 1', 2e6, 0.3), pd('点防御激光 2', 2e6, 0.3)],
      doctrine: { range: 400e3, jink: true },
      blurb: '两方海军里数量最多的就是护卫舰。两座激光炮塔、一门 8 公斤弹丸的线圈炮、十二枚拦截弹。',
    },
    destroyer: {
      id: 'destroyer', name: '铁砧级驱逐舰', hull: 'Anvil', role: 'destroyer', length: 180,
      dryMass: 5000e3, propMass: 6000e3, exhaustVelocity: 60e3, thrust: 110e6,
      angAccel: 0.009, maxAngVel: 0.14,
      reactorPower: 250e6, idleHeat: 8e6, driveHeat: 100e6, sinkCapacity: 60e9, radiatorArea: 1080, radiatorTemp: 1000, radiatorDeployTime: 45,
      sensorRange: 350e3, activeRange: 1500e3,
      armour: { nose: 45, flank: 18, tail: 8 },
      mounts: [beam('激光炮塔 A', 15e6, 1.2, 1064e-9, 'turret'), beam('激光炮塔 B', 15e6, 1.2, 1064e-9, 'turret'), coil('重型线圈炮 A', 4500, 12, 8, 100), coil('重型线圈炮 B', 4500, 12, 8, 100), bay('拦截弹发射舱', 16, 150, 250, 8000, 60), pd('点防御激光 1', 2.5e6, 0.3), pd('点防御激光 2', 2.5e6, 0.3), pd('点防御激光 3', 2.5e6, 0.3)],
      doctrine: { range: 600e3, jink: false },
      blurb: '两门重型线圈炮，舰首装甲 45 厘米。舰首转 180° 大约要 40 秒，舰尾只有 8 厘米。',
    },
    cruiser: {
      id: 'cruiser', name: '哈克尼斯级巡洋舰', hull: 'Harkness', role: 'cruiser', length: 320,
      dryMass: 14000e3, propMass: 15000e3, exhaustVelocity: 60e3, thrust: 250e6,
      angAccel: 0.005, maxAngVel: 0.1,
      reactorPower: 600e6, idleHeat: 15e6, driveHeat: 220e6, sinkCapacity: 150e9, radiatorArea: 2500, radiatorTemp: 1000, radiatorDeployTime: 60,
      sensorRange: 450e3, activeRange: 2000e3,
      armour: { nose: 70, flank: 28, tail: 12 },
      mounts: [beam('主激光 A', 25e6, 1.6, 1064e-9, 'turret'), beam('主激光 B', 25e6, 1.6, 1064e-9, 'turret'), beam('主激光 C', 25e6, 1.6, 1064e-9, 'turret'), beam('主激光 D', 25e6, 1.6, 1064e-9, 'turret'), coil('重型线圈炮 A', 5000, 20, 10, 80), coil('重型线圈炮 B', 5000, 20, 10, 80), bay('拦截弹发射舱', 24, 150, 250, 8000, 60), pd('点防御激光 1', 3e6, 0.35), pd('点防御激光 2', 3e6, 0.35), pd('点防御激光 3', 3e6, 0.35), pd('点防御激光 4', 3e6, 0.35), pd('点防御激光 5', 3e6, 0.35), pd('点防御激光 6', 3e6, 0.35)],
      doctrine: { range: 800e3, jink: false },
      blurb: '旗舰舰体。四门主激光，反射镜口径 1.6 米，是木星系统里最宽的；舰首装甲 70 厘米。',
    },
    lancer: {
      id: 'lancer', name: '枪骑兵级拦截母舰', hull: 'Lancer', role: '导弹艇', length: 90,
      dryMass: 1200e3, propMass: 1600e3, exhaustVelocity: 50e3, thrust: 30e6,
      angAccel: 0.025, maxAngVel: 0.22,
      reactorPower: 50e6, idleHeat: 2e6, driveHeat: 28e6, sinkCapacity: 12e9, radiatorArea: 300, radiatorTemp: 1000, radiatorDeployTime: 25,
      sensorRange: 300e3, activeRange: 1200e3,
      armour: { nose: 12, flank: 6, tail: 3 },
      mounts: [bay('拦截弹发射舱 A', 12, 150, 250, 8000, 60), bay('拦截弹发射舱 B', 12, 150, 250, 8000, 60), pd('点防御激光', 2e6, 0.3)],
      doctrine: { range: 2500e3, jink: true },
      blurb: '二十四枚拦截弹，一门点防御激光。它在 2 500 公里外就发射。再靠近，只剩 12 厘米舰首装甲和没东西可打的炮位。',
    },
    freighter: {
      id: 'freighter', name: '子午线级货船', hull: 'Meridian', role: 'freighter', length: 250,
      dryMass: 6000e3, propMass: 8000e3, exhaustVelocity: 40e3, thrust: 25e6,
      angAccel: 0.004, maxAngVel: 0.06,
      reactorPower: 40e6, idleHeat: 3e6, driveHeat: 20e6, sinkCapacity: 60e9, radiatorArea: 800, radiatorTemp: 900, radiatorDeployTime: 60,
      sensorRange: 120e3, activeRange: 0,
      armour: { nose: 5, flank: 3, tail: 2 },
      mounts: [],
      doctrine: { range: 0, jink: false, civilian: true },
      blurb: '无武装散装货船。8 000 吨推进剂、25 兆牛推力，一个炮位都没有。两方舰队争的就是它运的货。',
    },
    station: {
      id: 'station', name: '轨道空间站', hull: 'Orbital station', role: 'station', length: 600,
      dryMass: 60000e3, propMass: 0, exhaustVelocity: 1, thrust: 0,
      angAccel: 0.001, maxAngVel: 0.01,
      reactorPower: 900e6, idleHeat: 30e6, driveHeat: 0, sinkCapacity: 1100e9, radiatorArea: 6000, radiatorTemp: 1000, radiatorDeployTime: 120,
      sensorRange: 500e3, activeRange: 2500e3,
      armour: { nose: 40, flank: 40, tail: 40 },
      mounts: [beam('防御激光 A', 20e6, 1.4, 1064e-9, 'turret'), beam('防御激光 B', 20e6, 1.4, 1064e-9, 'turret'), pd('点防御激光 1', 3e6, 0.35), pd('点防御激光 2', 3e6, 0.35), pd('点防御激光 3', 3e6, 0.35), pd('点防御激光 4', 3e6, 0.35)],
      doctrine: { range: 0, jink: false, stationary: true },
      blurb: '一座居住站，两门 20 兆瓦防御激光、6 000 平方米散热板。没有主推进器，只能留在轨道上。',
    },
  };

  const FACTIONS = {
    JC:  { id: 'JC',  name: '木星盟约',          short: '盟约', prefix: 'JCS', color: '#4fd1c5', dim: '#2a6f6a' },
    ISA: { id: 'ISA', name: '内星系管理局', short: '管理局',     prefix: 'ISV', color: '#f0a04b', dim: '#7a5024' },
    CIV: { id: 'CIV', name: '民用',                short: '民用',   prefix: 'JCV', color: '#b9c3d1', dim: '#5b6470' },
  };

  // Hull silhouettes, unit length along +x (nose at +0.5, tail at −0.5), unit width.
  const SHAPES = {
    corvette: [[0.5, 0], [0.2, 0.12], [-0.3, 0.12], [-0.42, 0.2], [-0.5, 0.2], [-0.5, -0.2], [-0.42, -0.2], [-0.3, -0.12], [0.2, -0.12]],
    frigate: [[0.5, 0], [0.3, 0.1], [0.1, 0.16], [-0.35, 0.16], [-0.45, 0.24], [-0.5, 0.24], [-0.5, -0.24], [-0.45, -0.24], [-0.35, -0.16], [0.1, -0.16], [0.3, -0.1]],
    destroyer: [[0.5, 0], [0.38, 0.14], [0.05, 0.18], [-0.1, 0.24], [-0.4, 0.24], [-0.5, 0.3], [-0.5, -0.3], [-0.4, -0.24], [-0.1, -0.24], [0.05, -0.18], [0.38, -0.14]],
    cruiser: [[0.5, 0], [0.42, 0.12], [0.2, 0.2], [0.0, 0.2], [-0.05, 0.28], [-0.35, 0.28], [-0.42, 0.36], [-0.5, 0.36], [-0.5, -0.36], [-0.42, -0.36], [-0.35, -0.28], [-0.05, -0.28], [0.0, -0.2], [0.2, -0.2], [0.42, -0.12]],
    lancer: [[0.5, 0], [0.25, 0.08], [0.25, 0.22], [-0.3, 0.22], [-0.3, 0.1], [-0.5, 0.14], [-0.5, -0.14], [-0.3, -0.1], [-0.3, -0.22], [0.25, -0.22], [0.25, -0.08]],
    freighter: [[0.5, 0.1], [0.4, 0.2], [-0.4, 0.2], [-0.5, 0.12], [-0.5, -0.12], [-0.4, -0.2], [0.4, -0.2], [0.5, -0.1]],
    station: 'ring',
  };

  OD.Ships = { roleName, CLASSES, FACTIONS, SHAPES };
})();
