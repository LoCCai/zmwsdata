/**
 * 角色 → 时装系统
 * 提取叶子: 宝珠升级/进阶, 时装续费/传承
 */
const u = require('../lib/utils');
const fs = require('fs');
const path = require('path');

function removeOutput(name) {
  const fp = path.join(u.OUTPUT_DIR, `${name}.json`);
  if (!fs.existsSync(fp)) return;
  fs.unlinkSync(fp);
  console.log(`  🗑️  ${name}.json 已移除`);
}

const FASHION_PART_ORDER = {
  clothes: 1,
  face: 2,
  head: 3,
  weapon: 4,
  wing: 5,
  matrix: 6,
};

const FASHION_PART_NAME = {
  clothes: '衣服',
  face: '面部',
  head: '头部',
  weapon: '武器',
  wing: '翅膀',
  matrix: '阵法',
};

function normalizeFashionRenew(renew) {
  if (!renew || typeof renew !== 'object') return {};

  const entries = Object.entries(renew)
    .map(([days, cost]) => ({
      rawDays: Number(days),
      daysLabel: days === '-1' ? '永久' : `${days}天`,
      itemId: cost[0],
      name: u.itemName(cost[0]),
      count: cost[1],
    }))
    .sort((left, right) => {
      if (left.rawDays === -1) return 1;
      if (right.rawDays === -1) return -1;
      return left.rawDays - right.rawDays;
    });

  return entries.reduce((result, entry) => {
    result[entry.daysLabel] = {
      itemId: entry.itemId,
      name: entry.name,
      count: entry.count,
    };
    return result;
  }, {});
}

function getFashionRenewSortValue(renew) {
  if (!renew || typeof renew !== 'object') return Number.MAX_SAFE_INTEGER;
  const priorityKeys = ['永久', '365天', '60天', '40天', '30天', '20天'];
  for (const key of priorityKeys) {
    const count = renew[key] && Number(renew[key].count);
    if (Number.isFinite(count)) return count;
  }
  const counts = Object.values(renew)
    .map((entry) => Number(entry && entry.count))
    .filter((count) => Number.isFinite(count));
  return counts.length > 0 ? Math.max(...counts) : Number.MAX_SAFE_INTEGER;
}

function getFashionTransSortValue(transCost) {
  if (!Array.isArray(transCost) || transCost.length === 0) return 0;
  return transCost.reduce((total, entry) => total + Number(entry.count || 0), 0);
}

// ━━━ 宝珠升级/进阶 ━━━ equipFashionBall.*.json ━━━━━━
function extractFashionBall() {
  const raw = u.loadTable('equipFashionBall');
  const byRankAndLevel = {};
  for (const r of raw) {
    if (!byRankAndLevel[r.rank]) byRankAndLevel[r.rank] = {};
    byRankAndLevel[r.rank][r.level] = r;
  }

  const maxRank = Math.max(...raw.map(r => r.rank));
  const sortedRanks = [];

  for (let r = 0; r <= maxRank; r++) {
    const rankObj = byRankAndLevel[r] || {};

    if (r === maxRank) {
      const topRow = rankObj[0] || {};
      sortedRanks.push({
        rank: r,
        isMaxRank: true,
        maxLevelRequired: null,
        levels: [],
        breakthrough: null,
        attributeValue: topRow.attributeValue || null
      });
      continue;
    }

    const levels = [];
    for (let lvl = 1; lvl <= 12; lvl++) {
      const currRow = rankObj[lvl] || {};
      const prevRow = rankObj[lvl - 1] || {};
      levels.push({
        id: currRow.id,
        level: lvl,
        stepLabel: `${lvl - 1}级 → ${lvl}级`,
        upResources: prevRow.upResources
          ? { itemId: prevRow.upResources[0], name: u.itemName(prevRow.upResources[0]), count: prevRow.upResources[1] }
          : null,
        attributeValue: currRow.attributeValue || null,
        resourceId: currRow.resourceId || prevRow.resourceId
      });
    }

    const capRow = rankObj[12] || {};
    const nextRankRow0 = (byRankAndLevel[r + 1] && byRankAndLevel[r + 1][0]) || {};

    const breakthrough = {
      fromRank: r,
      toRank: r + 1,
      stepLabel: `${r}阶 → ${r + 1}阶 升阶突破`,
      upLevelLimits: capRow.upLevelLimits || null,
      upResources: capRow.upResources
        ? { itemId: capRow.upResources[0], name: u.itemName(capRow.upResources[0]), count: capRow.upResources[1] }
        : null,
      attributeValue: nextRankRow0.attributeValue || null
    };

    sortedRanks.push({
      rank: r,
      isMaxRank: false,
      maxLevelRequired: capRow.upLevelLimits || null,
      levels,
      breakthrough
    });
  }

  u.saveOutput('role_fashion_ball', sortedRanks, {
    system: '角色 → 时装系统 → 宝珠 → 升级/进阶',
    source: 'equipFashionBall.*.json',
    costType: '本阶逐级升级(时装经验) + 阶末升阶突破(点券与角色等级)',
    dedup: '按 rank(阶) 分组；每阶含 1~12 级时装经验升级与最终升阶突破（获得全属性大幅提升）',
  });
}

// ━━━ 时装续费/传承 ━━━ equipFashion.*.json (renew/transCost字段) ━━━━
function extractFashionRenew() {
  const raw = u.loadTable('equipFashion');
  const withRenew = raw.filter((record) => (
    record.renew && (record.type === 1 || record.part === 'wing' || record.part === 'matrix')
  ));

  const partMap = new Map();

  for (const record of withRenew) {
    const part = record.part || 'unknown';
    if (!partMap.has(part)) {
      partMap.set(part, {
        part,
        partName: FASHION_PART_NAME[part] || part,
        groups: new Map(),
      });
    }

    const renew = normalizeFashionRenew(record.renew);
    const transCost = u.parseCost(record.transCost);
    const groupKey = JSON.stringify({ renew, transCost });

    if (!partMap.get(part).groups.has(groupKey)) {
      partMap.get(part).groups.set(groupKey, {
        renew,
        transCost,
        hasTransCost: Array.isArray(transCost) && transCost.length > 0,
        fashions: [],
      });
    }

    partMap.get(part).groups.get(groupKey).fashions.push(record.name);
  }

  const result = [...partMap.values()]
    .map((partGroup) => {
      const groups = [...partGroup.groups.values()]
        .sort((left, right) => {
          return getFashionRenewSortValue(left.renew) - getFashionRenewSortValue(right.renew)
            || getFashionTransSortValue(left.transCost) - getFashionTransSortValue(right.transCost)
            || right.fashions.length - left.fashions.length;
        })
        .map((group, index) => ({
          category: `第${index + 1}类`,
          fashionCount: group.fashions.length,
          renew: group.renew,
          transCost: group.transCost,
          hasTransCost: group.hasTransCost,
          fashions: group.fashions.slice().sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
        }));

      return {
        part: partGroup.part,
        partName: partGroup.partName,
        groupCount: groups.length,
        fashionCount: groups.reduce((total, group) => total + group.fashionCount, 0),
        groups,
      };
    })
    .sort((left, right) => {
      return (FASHION_PART_ORDER[left.part] || 99) - (FASHION_PART_ORDER[right.part] || 99)
        || left.part.localeCompare(right.part, 'zh-Hans-CN');
    });

  u.saveOutput('role_fashion_renew', result, {
    system: '角色 → 时装系统 → 时装 → 各部位续费与传承',
    source: 'equipFashion.*.json (renew/transCost字段)',
    costType: '点券/道具续费 renew + 传承消耗 transCost',
    dedup: '参考宠物升星结构；以部位为主，每个部位内按“续费完全相同 + 传承完全相同（翅膀/阵法为空）”聚成一类，类内只保留 fashions 数组',
  });
}

function extract() {
  console.log('\n📦 角色 → 时装系统');
  extractFashionBall();
  extractFashionRenew();
  removeOutput('role_fashion_wardrobe');
}

if (require.main === module) extract();
module.exports = extract;
