/**
 * 角色 → 装备系统
 * 提取叶子: 强化, 重铸+升重, 熔炼, 洗练, 宝石
 */
const u = require('../lib/utils');

// ━━━ 强化 ━━━ equipUpgrade.*.json ━━━━━━━━━━━━━━━━━━━
function extractUpgrade() {
  const raw = u.loadTable('equipUpgrade');
  const tiers = u.dedupByLevelTier(raw);
  u.saveOutput('role_equip_upgrade', tiers, {
    system: '角色 → 装备系统 → 强化',
    source: 'equipUpgrade.*.json',
    costType: '经验条(exp) + 道具(cost: 灵魂)',
    dedup: '每10级一段共30段, 8角色×6部位共享同一张表',
    note: '1级exp=100(特例), 其余同段内exp相同'
  });
}

// ━━━ 重铸+升重 ━━━ equipMake.*.json ━━━━━━━━━━━━━━━━━
function extractMake() {
  const raw = u.loadTable('equipMake');
  const equip = u.loadTable('equip');
  const equipById = new Map(equip.map(e => [e.id, e]));
  const roleSuffix = /(·悟空|·唐僧|·八戒|·沙僧|·敖烈|·白龙|·杨戬|·孟婆)$/;
  const rows = raw.filter(r => r.cost);
  const dedupMap = new Map();

  function parseInjectCost(inject) {
    if (!Array.isArray(inject)) return null;
    return inject.map((it, index) => {
      const toAffixLevel = it[0];
      const toWeight = Number.parseInt(String(toAffixLevel).slice(-1), 10);
      const targetWeight = Number.isFinite(toWeight) && toWeight > 0 ? toWeight : index + 1;
      const fromWeight = targetWeight - 1;
      return {
        fromWeight,
        toWeight: targetWeight,
        stageLabel: `${fromWeight}重 → ${targetWeight}重`,
        toAffixLevel,
        cost: u.parseCost(it[1])
      };
    });
  }

  const consts = u.loadTable('consts');
  const equipReplaceEntry = consts.find(c => c.key === 'equipReplace');
  const equipReplace = equipReplaceEntry ? equipReplaceEntry.value : {};

  for (const r of rows) {
    const eq = equipById.get(r.id);
    const isRecastSeries = !!(r.recast && r.recast.reduction);
    if (isRecastSeries && (!eq || eq.part !== 'jewelry')) continue;

    const finalCostRaw = (r.costN1 && r.costN1.length > 0) ? r.costN1 : r.cost;
    const key = [
      r.group,
      JSON.stringify(finalCostRaw),
      (r.recast ? '__has_recast__' : '__no_recast__')
    ].join('|');

    if (!dedupMap.has(key)) {
      const recastUpgrade = parseInjectCost(eq && eq.affixInjectCost);
      const recastUpgradeN1 = parseInjectCost(eq && eq.affixInjectCostN1);
      const finalUpgrade = (recastUpgradeN1 && recastUpgradeN1.length > 0) ? recastUpgradeN1 : recastUpgrade;

      dedupMap.set(key, {
        id: r.id,
        name: (r.name || '').replace(roleSuffix, ''),
        group: r.group,
        groupName: r.groupName,
        cost: u.parseCost(finalCostRaw),
        recast: r.recast ?? null,
        recastUpgrade: finalUpgrade,
        recast0To1Cost: finalUpgrade && finalUpgrade.length > 0 ? finalUpgrade[0].cost : null,
        transCost: (r.group != null && equipReplace[r.group] && equipReplace[r.group]['3']) ? {
          perfect: u.parseCost(equipReplace[r.group]['3'][0]),
          percent: u.parseCost(equipReplace[r.group]['3'][1]),
          normal: u.parseCost(equipReplace[r.group]['3'][2])
        } : null
      });
    }
  }

  const result = [...dedupMap.values()].sort((a, b) =>
    a.group - b.group || a.id - b.id
  );

  u.saveOutput('role_equip_make', result, {
    system: '角色 → 装备系统 → 重铸+升重',
    source: 'equipMake.*.json + equip.*.json(affixInjectCost)',
    costType: '道具消耗列表(取高品质costN1) + 升重',
    dedup: `按 group+最终cost 去重, 忽略角色差异; 神化/魔化仅保留戒指 (原始${rows.length}条→去重${result.length}条)`
  });
}

// ━━━ 熔炼 ━━━ equipSmelt.*.json ━━━━━━━━━━━━━━━━━━━━━
function extractSmelt() {
  const raw = u.loadTable('equipSmelt');
  const result = raw.map(r => ({
    id: r.id, quality: r.quality, part: r.part,
    smeltLv: r.smeltLv, unlockLv: r.unlockLv,
    cost: u.parseCost(r.cost)
  }));
  u.saveOutput('role_equip_smelt', result, {
    system: '角色 → 装备系统 → 熔炼',
    source: 'equipSmelt.*.json',
    costType: '道具消耗 cost:{"itemId":count}',
    dedup: '按 quality×part 组合, 同品质同部位一个消耗值'
  });
}

// ━━━ 洗练 ━━━ luckBaptism.*.json (type=equip) ━━━━━━━
function extractStone() {
  const raw = u.loadTable('stone');
  const groups = {};
  for (const r of raw) {
    if (!groups[r.group]) {
      groups[r.group] = {
        group: r.group,
        groupName: r.name.replace(/\d+级/, ''),
        levels: []
      };
    }
    groups[r.group].levels.push({
      id: r.id, name: r.name, level: r.level,
      attribute: r.attribute, attributeValue: r.attributeValue,
      sellCost: r.sellCost ? r.sellCost.map(c => ({
        itemId: c[0], name: u.itemName(c[0]),
        count: Array.isArray(c[1]) ? { min: c[1][0], max: c[1][1] } : c[1]
      })) : null
    });
  }
  u.saveOutput('role_equip_stone', Object.values(groups), {
    system: '角色 → 装备系统 → 宝石',
    source: 'stone.*.json',
    costType: '合成消耗 sellCost:[[itemId,[min,max]]]',
    dedup: '按 group(宝石类型) 分组, 每种~10级, 3个低级合1个高级'
  });
}

// ━━━ 传承 ━━━ consts.*.json (equipReplace) ━━━━━━━━━
function extractTrans() {
  const consts = u.loadTable('consts');
  const equipReplaceEntry = consts.find(c => c.key === 'equipReplace');
  const equipReplace = equipReplaceEntry ? equipReplaceEntry.value : {};

  const levels = Object.entries(equipReplace).map(([lvStr, typeMap]) => {
    const level = Number(lvStr);
    const EQUIP_SERIES_NAMES = { 20: "天煞", 30: "白霜", 40: "罗刹", 50: "幽冥", 60: "宣花", 70: "混元", 80: "紫金", 90: "火龙", 100: "九龙", 110: "三霄", 120: "仙鞘", 130: "灵鳌", 140: "金仙", 150: "究天", 160: "摩愿", 170: "罗悲", 180: "浮行", 190: "多智", 200: "风廉", 210: "萍雨", 220: "震雷", 230: "朱电", 240: "240级" };
    const seriesName = EQUIP_SERIES_NAMES[level] || `${level}级`;
    const costArr = typeMap['3'] || [];
    const perfectCost = costArr[0] ? costArr[0].map(c => ({ itemId: c[0], name: u.itemName(c[0]), count: c[1] })) : [];
    const percentCost = costArr[1] ? costArr[1].map(c => ({ itemId: c[0], name: u.itemName(c[0]), count: c[1] })) : [];
    const normalCost = costArr[2] ? costArr[2].map(c => ({ itemId: c[0], name: u.itemName(c[0]), count: c[1] })) : [];

    return {
      level,
      seriesName,
      perfectCost,
      percentCost,
      normalCost
    };
  }).sort((a, b) => a.level - b.level);

  const rules = [
    {
      title: '完美传承',
      type: 0,
      costItem: '天罡传承券',
      desc: '目标神魔装备完整继承源神魔装备的附加词条类型；数值按源词条在原属性区间的百分比映射到目标装备词条区间。'
    },
    {
      title: '百分比传承',
      type: 1,
      costItem: '天罡传承券',
      desc: '目标神魔装备继承源神魔装备词条的百分比比例，并按目标装备的词条池重新投射。'
    },
    {
      title: '普通传承',
      type: 2,
      costItem: '地煞传承券',
      desc: '目标神魔装备继承源神魔装备词条，词条数值按目标区间重新随机生成。'
    },
    {
      title: '材料多退少补规则',
      desc: '传承时会计算源神魔装备累计投入的重铸石与神化/魔化材料；若源装备累计投入材料多于目标装备，差额材料原样退还；若不足，则需在传承时补齐对应差额材料。'
    }
  ];

  u.saveOutput('role_equip_trans', { levels, rules }, {
    system: '角色 → 装备系统 → 传承',
    source: 'consts.*.json (equipReplace)',
    costType: '天罡传承券(完美/百分比) + 地煞传承券(普通) + 重铸材料多退少补',
    dedup: '按目标装备等级 30~240 级，每 10 级一档'
  });
}

// ━━━ 主入口 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function extract() {
  console.log('\n📦 角色 → 装备系统');
  extractUpgrade();
  extractMake();
  extractSmelt();
  extractStone();
  extractTrans();
}

if (require.main === module) extract();
module.exports = extract;




