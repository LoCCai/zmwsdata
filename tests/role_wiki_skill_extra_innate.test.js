const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const outputFile = path.join(repoRoot, 'output', 'role_wiki_skill_extra.json');
const extractSkillExtraWiki = require(path.join(repoRoot, 'scripts', 'extract', 'role_wiki_skill_extra.js'));
extractSkillExtraWiki();

const payload = JSON.parse(fs.readFileSync(outputFile, 'utf8')).data;

assert.strictEqual(payload.slots.length, 6, '绝技无双应包含三张传说绝技和三张先天绝技');

const pairs = [
  {
    legendaryId: 21801010101,
    innateId: 21804010101,
    name: '至尊幻装·剑神无我',
    innateTotalPer: 15.526,
    innateLv1Val: 31100,
    innateMaxVal: 1098938,
  },
  {
    legendaryId: 21802010101,
    innateId: 21805010101,
    name: '雷神幻装·万劫天雷',
    innateTotalPer: 15.525,
    innateLv1Val: 31099,
    innateMaxVal: 1098938,
  },
  {
    legendaryId: 21803010101,
    innateId: 21806010101,
    name: '胧月幻装·胧月旖梦',
    innateTotalPer: 15.525,
    innateLv1Val: 31099,
    innateMaxVal: 1098943,
  },
];

for (const pair of pairs) {
  const legendaryIndex = payload.slots.findIndex((slot) => slot.base.skillId === pair.legendaryId);
  const innateIndex = payload.slots.findIndex((slot) => slot.base.skillId === pair.innateId);
  const legendary = payload.slots[legendaryIndex];
  const innate = payload.slots[innateIndex];

  assert.ok(legendary, `缺少 ${pair.name} 传说绝技`);
  assert.ok(innate, `缺少 ${pair.name} 先天绝技`);
  assert.strictEqual(legendary.slotLabel, '传说绝技');
  assert.strictEqual(innate.slotLabel, '先天绝技');
  assert.strictEqual(legendary.base.name, pair.name);
  assert.strictEqual(innate.base.name, pair.name, `先天进阶应沿用 ${pair.name} 绝技名`);
  assert.strictEqual(innateIndex, legendaryIndex + 1, `${pair.name} 先天进阶应紧跟对应传说绝技展示`);
  assert.strictEqual(innate.base.header.totalPer, pair.innateTotalPer);
  assert.strictEqual(innate.base.levels[0].totalVal, pair.innateLv1Val);
  assert.strictEqual(innate.base.levels.at(-1).totalVal, pair.innateMaxVal);
}
