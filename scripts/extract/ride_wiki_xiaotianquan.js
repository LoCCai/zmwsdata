/** 哮天犬：从当前技能表、动作链和弹体导出，不固定等级上限或伤害倍率。 */
const fs = require('fs');
const u = require('../lib/utils');
const eng = require('./lib/ride-skill-engine');

const RIDE_ID = 241001;
const DEFINITIONS = [
  { id: 20630010101, slot: 'skillActive1', label: '技能1', effects: ['流血目标可额外触发幽狼下扑；条件追击不并入基础伤害。'] },
  { id: 20630010201, slot: 'skillActive2', label: '技能2', actions: [20630010201, 20630010203],
    effects: ['基础冲锋后接收招动作；再次按键消耗充能进入强化冲锋，两个分支分别展示。'] },
  { id: 20630010202, slot: 'skillActive2_2', label: '技能2·二段', name: '恶犬冲击·强化冲锋',
    cdSource: 20630010201, actions: [20630010202, 20630010203], effects: ['强化冲锋消耗同一技能的充能，不另计独立冷却。'] },
  { id: 20630010301, slot: 'skillActive3', label: '技能3', effectOnly: true,
    effects: ['召唤物输出与流血联动单独结算，不作为本体直接伤害。'] },
  { id: 20630010401, slot: 'skillActive4', label: '技能4',
    effects: ['冲击波造成七次持续伤害和一次终段伤害；对流血目标的条件追击不叠加进基础伤害。'] },
  { id: 20630010501, slot: 'skillSp1', label: '无双', source: 20630010502,
    actions: [20630010501, 20630010502, 20630010503], effects: ['无双按前摇、主段、收招的完整动作链计时。'] },
  { id: 20630010601, slot: 'skillPassive1', label: '被动', effectOnly: true },
];
const round = n => Math.round(n * 1e6) / 1e6;
const index = rows => new Map(rows.map(row => [row.id, row]));

function extract() {
  // 保留现有资料入口，并明确 close 状态。
  const ride = JSON.parse(fs.readFileSync(u.findTableFile('ride'), 'utf8')).find(row => row.id === RIDE_ID);
  if (!ride) throw new Error('ride 表缺少哮天犬');
  const skills = index(u.loadTable('skill'));
  const rows = index(u.loadTable('skillLevel'));
  const monster = index(u.loadTable('monster')).get(ride.monsterId);
  const cfg = eng.loadEntityCfg(monster?.cfgFile);
  if (!cfg) throw new Error('缺少哮天犬实体配置');
  const monsters = index(u.loadTable('monster'));
  const summonMonster = monsters.get(cfg.skill3_1.com.find(c => c.type === 13 && !c.notActive).mIds[0]);
  const summonSkill = skills.get(summonMonster.skillIds[0]);
  const summonCfg = eng.loadEntityCfg(summonMonster.cfgFile);
  if (!summonCfg) throw new Error('缺少哮天犬召唤物实体配置');
  const summonMaxLevel = eng.detectMaxLevel(summonSkill, rows);
  const beskillById = index(u.loadTable('beskill'));

  const slots = DEFINITIONS.map(def => {
    const skill = skills.get(def.id);
    const source = skills.get(def.source || def.id);
    if (!skill || !source) throw new Error(`缺少哮天犬技能 ${def.id}`);
    const warnings = [];
    const slotKind = def.slot.startsWith('skillPassive') ? 'passive' : def.slot.startsWith('skillSp') ? 'sp' : 'active';
    const maxLevel = slotKind === 'passive' ? 1 : eng.detectMaxLevel(source, rows);
    const actionIds = def.actions || [def.id];
    let frames = null;
    if (slotKind !== 'passive') {
      frames = 0;
      for (const id of actionIds) {
        const actionSkill = skills.get(id);
        const rel = eng.resolveReleaseTime(cfg, actionSkill.entityAction, !!cfg[actionSkill.entityAction], warnings, actionSkill);
        if (rel.releaseFrames == null) throw new Error(`哮天犬动作 ${id} 缺少计时`);
        frames += rel.releaseFrames;
      }
    }
    const seconds = frames == null ? null : frames / 30;
    const levels = [];
    let reference;
    for (let lv = 1; lv <= maxLevel; lv++) {
      const row = rows.get(eng.skillLevelRowId(source, lv));
      if (!row && slotKind !== 'passive') throw new Error(`哮天犬 ${source.id} 缺少 Lv.${lv}`);
      const dmg = def.effectOnly ? { kind: 'effectOnly', segments: [], totalPer: null, totalVal: null }
        : eng.computeActionDamage(source, row, cfg[source.entityAction], warnings);
      reference = dmg;
      const per = dmg.totalPer == null ? null : round(dmg.totalPer);
      const value = per != null && seconds > 0 ? round(per / seconds) : null;
      levels.push({ level: lv, roleLevel: row?.roleLevel ?? null, consumeMp: row?.consumeMp ?? null,
        soulCost: row?.soulCost ?? null, segmentVals: dmg.segments.map(s => ({ val: s.val, maxHit: s.maxHit })),
        totalPer: per, totalVal: dmg.totalVal == null ? null : round(dmg.totalVal), growthBuffs: [],
        metrics: value == null ? [] : [{ key: 'atkConv', label: '攻转', value, display: value }] });
      if (def.id === 20630010301) {
        const summonRow = rows.get(eng.skillLevelRowId(summonSkill, Math.min(lv, summonMaxLevel)));
        if (!summonRow) throw new Error(`幽犬技能缺少 Lv.${lv}`);
        const summonDamage = eng.computeActionDamage(summonSkill, summonRow, summonCfg[summonSkill.entityAction], warnings);
        levels.at(-1).metrics = [
          { key: 'dogSingleVal', label: '幽犬单段固伤', value: summonRow.damageAddVal, display: summonRow.damageAddVal },
          { key: 'dogTotalVal', label: '幽犬单次总固伤', value: summonDamage.totalVal, display: summonDamage.totalVal },
        ];
      }
    }
    const cdSkill = skills.get(def.cdSource || def.id);
    const fixedBuffs = (def.effects || []).map(text => ({ name: '技能机制', bindSource: 'mechanismEffect',
      bindLabel: '机制效果', displayText: text, time: null, value: null }));
    if (def.id === 20630010301) {
      const summons = cfg[skill.entityAction].com.filter(c => c.type === 13 && !c.notActive);
      fixedBuffs.push({ name: '召唤配置', bindSource: 'mechanismEffect', bindLabel: '机制效果',
        displayText: `召唤 ${summons.length} 只幽犬，每只配置持续 ${summons[0].time} 秒；继承技能等级，上限 ${summonMaxLevel} 级。`, time: null, value: null });
    }
    if (slotKind === 'passive') {
      const passive = skill.beSkill.map(id => beskillById.get(id)).find(b => b?.label === 'bloodPackage')?.attribute;
      if (!passive) throw new Error('缺少聚血凝珠被动配置');
      fixedBuffs.push({ name: '聚血凝珠', bindSource: 'mechanismEffect', bindLabel: '被动效果', time: null, value: passive,
        displayText: `流血实际伤害的 ${passive.selfRate * 100}% 充入血珠，上限为自身最大生命的 ${passive.maxHp2maxVal * 100}%；离场时治疗友方神将。每人分配比例为 ${passive.shareHpToCamp.divPer * 100}% ÷ 神将人数 + ${passive.shareHpToCamp.fixPer * 100}%。` });
    }
    const name = def.name || skill.desName || skill.Name;
    const base = { skillId: def.id, name, icon: skill.icon, attribute: skill.attribute,
      entityAction: skill.entityAction, concreteSkillIds: [source.id], desIntro: skill.desIntro,
      header: { kind: reference.kind, segments: reference.segments.map(({ per, maxHit, from }) => ({ per, maxHit, from })),
        segCount: reference.segments.reduce((sum, s) => sum + s.maxHit, 0), totalPer: levels.at(-1).totalPer,
        releaseFrames: frames, releaseSeconds: seconds,
        releaseTimeSource: frames == null ? 'effectOnly' : `sequence:${actionIds.map(id => skills.get(id).entityAction).join('+')}`,
        cfgFileResolved: monster.cfgFile, cd: cdSkill.cd ?? null, addDefendVal: skill.addDefendVal,
        referenceLevel: levels.at(-1).level, fixedBuffs, metrics: [],
        note: '当前官方坐骑配置标记为关闭；此处保留配置资料。' },
      maxLevel, slotLabel: def.label, slotKind, levels, warnings };
    return { slot: def.slot, slotLabel: def.label, slotKind, base, awakens: [], allAwakenIdentical: false };
  });
  u.saveOutput('ride_wiki_xiaotianquan', {
    rideGroup: { key: 'xiaotianquan', name: ride.name, rideIds: [ride.id], note: '官方 close 配置资料；伤害与完整动作耗时从当前配置导出，条件追击与召唤物不并入基础伤害。' },
    variants: [{ ride: { id: ride.id, idGroup: ride.idGroup, name: ride.name, rank: ride.rank, type: ride.type,
      monsterId: ride.monsterId, monsterName: monster.name, cfgFile: monster.cfgFile, close: ride.close }, slots }],
  }, { system: 'ride_wiki', sourceFiles: ['ride.*.json', 'skill.*.json', 'skillLevel.*.json', 'monster.*.json', 'beskill.*.json', 'bullets.json', 'entityCtg/*.json'] });
}
if (require.main === module) extract();
module.exports = extract;
