/**
 * 坐骑技能 Wiki - 应龙/黄龙提取脚本
 *
 * 覆盖形态：
 * - 201901 应龙 (一阶)
 * - 201902 神天应龙 (二阶/超进化)
 * - 201903 黄龙 (一阶异化)
 * - 201904 尊瑞黄龙 (二阶/超进化异化)
 */
const fs = require("fs");
const path = require("path");
const u = require("../lib/utils");
const eng = require("./lib/skill-engine");
const ov = require("./lib/overrides");
const metrics = require("./lib/metrics");

const RIDE_OVERRIDE = "yinglong";
const EMIT_TEMPLATE = process.argv.includes("--emit-template");
const FORCE = process.argv.includes("--force");

const RIDE_IDS = [
  201902, // 神天应龙 (二阶/超进化)
  // 201904, // 尊瑞黄龙 (二阶/超进化异化，待官方正式上线后开启导出)
];
const SLOT_DEFS = [
  { key: "attack", labelPrefix: "普攻", kind: "attack" },
  { key: "skillActive", labelPrefix: "技能", kind: "active" },
  { key: "skillSp", labelPrefix: "无双", kind: "sp" },
  { key: "skillPassive", labelPrefix: "被动", kind: "passive" },
  { key: "riding", labelPrefix: "骑术", kind: "passive" },
];

const YINGLONG_MECHANICS = {
  // 普攻: 普攻1
  20635010001: [
    {
      label: "水刃攻击",
      value: "向前释放水流刃波，地面与飞行姿态均可释放，对前方目标造成 1 段 220% 水属性伤害与击退硬直。"
    },
    {
      label: "消耗蓄雨施加【雨湿】",
      value: "水属性攻击。命中目标消耗 66 点【蓄雨】值，施加 33 层【雨湿】状态（转化比例为每 2 点蓄雨转化 1 层【雨湿】；骑术形态下消耗 92 点施加 46 层）。"
    },
    {
      label: "水钻头追击联动",
      value: "在【澜汐凝珠】水球跟随期间发动普攻，5 颗水球转化为水钻头追击目标，追加 5 段共 450% 伤害，并消耗 254 点蓄雨施加 127 层【雨湿】。"
    }
  ],

  // 技能1: 电寰玄霆
  20635010101: [
    {
      label: "环身雷电打击",
      value: "释放雷电环绕自身，对周围目标造成 5 段伤害（每段 74.8%，总倍率 374.0%）与受击硬直。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。目标带有【雨湿】状态时，命中按 1% 基础攻击力/层引爆雨湿层数触发【水络电涌】追加伤害。基础形态单次引爆上限为 1,300 层（最高追加 1,300% 基础攻击力伤害；骑术形态上限提升至 1,826 层）。"
    }
  ],

  // 技能2: 雷翼奔矢
  20635010201: [
    {
      label: "长按冲刺机制",
      value: "前 16 帧检测起步，第 16 帧起进入持续冲刺。冲刺期间每帧消耗 300 独立能量，最多连续冲刺 9 次（耗尽 2700 能量）；中途松开按键或能量不足时提前中断进入收招。"
    },
    {
      label: "多段打击与充能联动",
      value: "冲刺过程造成 6 段打击（每段 42.5%，总倍率 255.0%）。受【蓄雨】系统联动，蓄雨值比例越高，充能效率提升最高 +10%（骑术形态下最高 +14%）。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。命中【雨湿】目标时引爆其雨湿层数，基础形态单次最多引爆 204 层（最高追加 204% 基础攻击力伤害；骑术形态上限提升至 285 层）。"
    }
  ],

  // 技能3: 澜汐凝珠
  20635010301: [
    {
      label: "水球跟随",
      value: "施放后在身后生成 5 颗跟随水球，持续 300 秒。"
    },
    {
      label: "二段激活·索敌治疗",
      value: "水球生成 1.5 秒后激活二段按键（持续 300 秒，不消耗能量）。再次按下技能键，5 颗水球锁定生命百分比最低的友方目标（包含自身）发射；友方不足 5 人时可重复选定单目标连续恢复，附加持续 20 秒的【回血】状态。"
    },
    {
      label: "普攻追击切换",
      value: "若不主动触发治疗，水球保持待命，发动普通攻击时转化为水钻头追击目标（详见【技能3·追击】）。"
    }
  ],

  // 技能3·追击: 澜汐凝珠·水钻头
  20635010303: [
    {
      label: "普攻联动触发",
      value: "水球跟随状态下发动普通攻击（地面普攻或空中跳攻）时，5 颗水球转化为水钻头（飞行速度 60）攻击目标。"
    },
    {
      label: "5段打击伤害",
      value: "每颗水钻头独立判定 1 段打击（单颗 90% 攻击力 + 对应等级固伤），5 颗全中造成 5 段共计 450% 攻击力伤害。"
    },
    {
      label: "施加【雨湿】印记",
      value: "水属性攻击。命中目标消耗 254 点【蓄雨】值。5 颗水钻头每颗命中独立附加 127 层【雨湿】（单颗 127 层，2:1 转化比例；骑术形态下单颗 177 层），5 颗全中累计施加 635 层【雨湿】（骑术形态全中 885 层）。【雨湿】状态每 1 帧自然衰减 1 层（每秒 30 层），单体堆叠上限为 3,700 层。"
    }
  ],

  // 技能4: 神雷破空
  20635010401: [
    {
      label: "5档长按蓄力机制",
      value: "长按技能键进入蓄力循环，分为 5 档蓄力（每 15 帧升一档，蓄满需 90 帧 / 3.0 秒），松手或蓄满后发射对应档位雷柱。"
    },
    {
      label: "逐帧增伤累积与加算机制",
      value: "蓄力期间每帧增加 1.25% 攻击力倍率，蓄满 90 帧累计增加 112.5% 攻击力倍率。增伤直接累加在攻击力倍率项（i.atkPer + 1.125），技能固伤部分不受增伤影响。"
    },
    {
      label: "8段打击与每段增伤结算",
      value: "发射雷柱，对目标造成 8 段打击（未蓄力基础总倍率 630.0%）。蓄力增伤值写入技能状态并在 8 段判定中持续生效，每段增加 112.5% 攻击力倍率：① 第 1 段由 497.7% 增至 610.2%；② 第 2~7 段（6段）每段由 18.9% 增至 131.4%（6段计 788.4%）；③ 第 8 段由 18.9% 增至 131.4%。8 段打满总倍率为 1,530.0%。"
    },
    {
      label: "坐骑强韧与蓄力层数标记",
      value: "起手与蓄力过程处于【坐骑强韧】状态，减少坐骑体力消耗 1125 点（免疫受击硬直），并按蓄力档位叠加蓄力层数标记。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。命中【雨湿】目标时引爆雨湿层数，按 1% 基础攻击力/层结算追加伤害。基础形态单次引爆上限为 1,338 层（最高追加 1,338% 基础攻击力伤害；骑术形态上限提升至 1,873 层）。"
    }
  ],

  // 无双: 尾画成江
  20635010501: [
    {
      label: "9段打击",
      value: "释放水浪弹幕，对全场目标造成 9 段打击（总倍率 600.0%）与击飞浮空。等效 CD 按坐骑通用无双标准 21 秒折算（固伤倍率 30X，固伤修正比 142.86%）。"
    },
    {
      label: "施加【雨湿】印记（每段独立附加）",
      value: "水属性攻击。命中目标消耗 173 点【蓄雨】值。弹幕附加状态在多段命中过程中不被清除，9 段打击每段均独立附加 86 层【雨湿】（单段 86 层，2:1 转化比例；骑术形态下每段 218 层），9 段全中单体累计附加 774 层【雨湿】（骑术形态下 9 段全中累计附加 1,962 层），单体上限 3,700 层。"
    }
  ],

  // 被动1: 羽嘉之翼
  20635010601: [
    {
      label: "双形态飞行姿态",
      value: "二段跳跃后再次按下跳跃键进入飞行姿态，角色移动与攻击切换为飞行姿态。"
    },
    {
      label: "体力消耗",
      value: "飞行姿态下每秒体力消耗增加 2.5 倍，触碰地面或体力耗尽时切换为地面姿态。"
    }
  ],

  // 被动2: 蓄雨
  20635010602: [
    {
      label: "专属蓄雨槽",
      value: "骑乘时激活独立【蓄雨】能量槽，上限 3700，初始满值 3700，骑乘过程中每帧自动回复 4 点（每秒 120 点）。"
    },
    {
      label: "属性增益",
      value: "根据当前【蓄雨】槽充盈比例提供增益：① 骑乘回血属性提升最高 +10%；② 全技能冷却缩减最高 -10%；③ 技能2充能效率提升最高 +10%；④ 提升角色本体属性：回血 +1%、回魔 +0.5%。"
    },
    {
      label: "水属性消耗蓄雨施加【雨湿】",
      value: "水属性攻击命中时按 2:1 比例消耗蓄雨值，并为受击目标附加【雨湿】印记（每 1 帧自然衰减 1 层，即每秒衰减 30 层，单体堆叠上限 3,700 层）。伤害判定的每段命中均结算该印记且不清除：① 普攻受击 1 段附加 33 层（骑术形态 46 层）；② 技能3水钻头追击 5 颗弹幕全中累计附加 635 层（单颗 127 层，骑术全中 885 层/单颗 177 层）；③ 无双技能 9 段每段均附加 86 层，全中累计附加 774 层（单段 86 层，骑术单段 218 层/9 段全中 1,962 层）。蓄雨值不足对应技能消耗门槛时，不扣除蓄雨且不施加雨湿。"
    },
    {
      label: "雷属性引爆【水络电涌】",
      value: "雷属性攻击命中【雨湿】目标时引爆其雨湿层数，按 1% 基础攻击力/层结算追加伤害：技能2引爆上限 204 层（追加 204% 基础攻击力伤害）；技能1引爆上限 1,300 层（追加 1,300% 基础攻击力伤害）；技能4引爆上限 1,338 层（追加 1,338% 基础攻击力伤害）。"
    }
  ],

  // 骑术: 蓄雨·骑 (应龙·骑术)
  20635010603: [
    {
      label: "角色属性继承",
      value: "解锁专属骑术后，额外继承角色 8% 的生命、回血、攻击、暴击。"
    },
    {
      label: "蓄雨槽扩容与回复",
      value: "独立【蓄雨】能量槽上限由 3,700 提升至 5,900（提升 59.5%），初始满值 5,900；骑乘过程中每帧自动回复由 4 点提升至 5 点（每秒 150 点，提升 25.0%）。"
    },
    {
      label: "属性增益强化",
      value: "根据当前【蓄雨】槽充盈比例提供的增益上限调整：① 骑乘回血属性提升上限由 +10% 调整为 +14%；② 全技能冷却缩减上限由 -10% 调整为 -14%；③ 技能2冲刺充能效率提升上限由 +10% 调整为 +14%。"
    },
    {
      label: "水属性施加【雨湿】调整",
      value: "水属性攻击消耗蓄雨与施加【雨湿】层数调整（维持 2:1 转化比例）：① 普通攻击单次消耗提升至 92 点，施加 46 层【雨湿】（基础 33 层）；② 技能3水钻头追击单次消耗提升至 355 点，5 颗单颗 177 层，全中累计施加 885 层【雨湿】（基础 635 层）；③ 无双技能单次消耗提升至 436 点，9 段单段施加 218 层，9 段全中累计施加 1,962 层【雨湿】（基础 774 层）。"
    },
    {
      label: "雷属性引爆【水络电涌】上限调整",
      value: "雷属性攻击引爆【雨湿】层数的配置上限调整（每层追加 1% 基础攻击力伤害）：① 技能2（雷翼奔矢）引爆上限由 204 层提升至 285 层（单次引爆最高追加 285% 基础攻击力伤害）；② 技能1（电寰玄霆）引爆上限由 1,300 层提升至 1,826 层（单次引爆最高追加 1,826% 基础攻击力伤害）；③ 技能4（神雷破空）引爆上限由 1,338 层提升至 1,873 层（单次引爆最高追加 1,873% 基础攻击力伤害）。受击目标单体【雨湿】堆叠上限为 3,700 层，实战中可全额引爆对应上限层数。"
    },
    {
      label: "角色本体加成",
      value: "提升角色本体属性：回血 +1.5%、回魔 +0.75%。"
    }
  ],

  // ══════════════ 尊瑞黄龙 (201904) 专属机制（待官方正式上线后解开注释启用） ══════════════
  /*
  // 普攻: 普攻1
  20635030001: [
    {
      label: "水刃攻击",
      value: "向前释放水流刃波，地面与飞行姿态均可释放，对前方目标造成 1 段 220.0% 水属性伤害与击退硬直。"
    },
    {
      label: "消耗蓄雨施加【雨湿】",
      value: "水属性攻击。命中目标消耗 10 点【蓄雨】值，施加 30 层【雨湿】状态。"
    },
    {
      label: "水钻头追击联动",
      value: "在【澜汐凝珠】水球跟随期间发动普攻，5 颗水球转化为水钻头追击目标，追加 5 段共 450.0% 伤害，并消耗 10 点蓄雨施加 250 层【雨湿】（每颗 50 层）。"
    }
  ],

  // 技能1: 电寰玄霆
  20635030101: [
    {
      label: "环身雷电打击",
      value: "释放雷电环绕自身，对周围目标造成 5 段伤害（每段 74.8%，总倍率 374.0%）与受击硬直。"
    },
    {
      label: "首次命中麻木",
      value: "首次命中目标施加麻木状态，造成持续 2.5 秒僵直，间隔 1.5 秒后再次造成 2.5 秒僵直。"
    },
    {
      label: "压缩雷球远程打击",
      value: "若释放时未命中目标，可在判定结束后激活二段技能，发射压缩雷球，对路径目标造成 5 段打击并施加麻木硬直。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。命中带有【雨湿】的目标时，按 10% 基础攻击力/层引爆雨湿层数触发【水络电涌】追加伤害，单次引爆上限为 10 层（最高追加 100% 基础攻击力伤害）。"
    }
  ],

  // 技能2: 雷翼奔矢
  20635030201: [
    {
      label: "充能与长按冲刺",
      value: "独立能量上限 10,500 点，启动门槛 6,000 点，每秒自动回复 690 点能量。长按进入持续冲刺，中途松开按键或能量不足时提前中断。"
    },
    {
      label: "8段打击与充能联动",
      value: "冲刺过程造成 8 段打击（4段持续加4段突进，每段 42.5%，总倍率 340.0%）。受【蓄雨】系统联动，根据蓄雨充盈比例提升充能效率最高 +10%。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。命中【雨湿】目标时引爆雨湿层数，按 10% 基础攻击力/层结算追加伤害，单次引爆上限为 20 层（最高追加 200% 基础攻击力伤害）。"
    }
  ],

  // 技能3: 澜汐凝珠
  20635030301: [
    {
      label: "水球跟随",
      value: "施放后在身后生成 5 颗跟随水球，持续 300 秒。"
    },
    {
      label: "二段激活·索敌治疗",
      value: "水球生成 1.5 秒后激活二段按键（持续 300 秒，不消耗能量）。再次按下技能键，5 颗水球锁定生命百分比最低的友方目标（包含自身）发射，连续命中同一目标存在衰减机制（第 1 次恢复全额，第 2 次衰减 -40%，第 3~5 次衰减 -90%）。"
    },
    {
      label: "普攻追击切换",
      value: "若不主动触发治疗，水球保持待命，发动普通攻击时转化为水钻头追击目标（详见【技能3·追击】）。"
    }
  ],

  // 技能3·追击: 澜汐凝珠·水钻头
  20635030303: [
    {
      label: "普攻联动触发",
      value: "水球跟随状态下发动普通攻击（地面普攻或空中跳攻）时，5 颗水球转化为水钻头攻击目标。"
    },
    {
      label: "5段打击伤害",
      value: "每颗水钻头独立判定 1 段打击（单颗 90% 攻击力 + 对应等级固伤），5 颗全中造成 5 段共计 450.0% 攻击力伤害。"
    },
    {
      label: "施加【雨湿】印记",
      value: "水属性攻击。命中目标消耗 10 点【蓄雨】值。5 颗水钻头每颗命中独立附加 50 层【雨湿】，5 颗全中累计施加 250 层【雨湿】。【雨湿】状态每 1 帧自然衰减 1 层（每秒 30 层），单体堆叠上限为 3,700 层。"
    }
  ],

  // 技能4: 神雷破空
  20635030401: [
    {
      label: "5档长按蓄力机制",
      value: "长按技能键进入蓄力循环，分为 5 档蓄力（每 15 帧升一档，蓄满需 90 帧 / 3.0 秒），松手或蓄满后发射对应档位雷柱。"
    },
    {
      label: "逐帧增伤累积与加算机制",
      value: "蓄力期间每帧增加 1.25% 攻击力倍率，蓄满 90 帧累计增加 112.5% 攻击力倍率。增伤直接累加在攻击力倍率项，技能固伤部分不受增伤影响。"
    },
    {
      label: "8段打击与每段增伤结算",
      value: "发射雷柱（尺寸缩放 1.17），对目标造成 8 段打击（未蓄力基础总倍率 630.0%）。蓄力增伤值写入技能状态并在 8 段判定中持续生效，每段增加 112.5% 攻击力倍率：① 第 1 段由 497.7% 增至 610.2%；② 第 2~7 段（6段）每段由 18.9% 增至 131.4%（6段计 788.4%）；③ 第 8 段由 18.9% 增至 131.4%。8 段打满总倍率为 1,530.0%。"
    },
    {
      label: "坐骑强韧与蓄力层数标记",
      value: "起手与蓄力过程处于【坐骑强韧】状态，减少坐骑体力消耗 1125 点（免疫受击硬直），并按蓄力档位叠加蓄力层数标记。"
    },
    {
      label: "引爆【水络电涌】",
      value: "雷属性攻击。命中【雨湿】目标时引爆雨湿层数，按 10% 基础攻击力/层结算追加伤害，单次引爆上限为 20 层（最高追加 200% 基础攻击力伤害）。"
    }
  ],

  // 无双: 尾画成江
  20635030501: [
    {
      label: "9段打击",
      value: "释放水浪弹幕，对全场目标造成 9 段打击（前 8 段每段 12.0%，第 9 段 504.0%，总倍率 600.0%）与击飞浮空。等效 CD 按坐骑通用无双标准 21 秒折算。"
    },
    {
      label: "施加【雨湿】印记（每段独立附加）",
      value: "水属性攻击。命中目标消耗 10 点【蓄雨】值。9 段打击每段均独立附加 90 层【雨湿】，9 段全中单体累计附加 810 层【雨湿】，单体上限 3,700 层。"
    }
  ],

  // 被动1: 羽嘉之翼
  20635030601: [
    {
      label: "双形态飞行姿态",
      value: "二段跳跃后再次按下跳跃键进入飞行姿态，角色移动与攻击切换为飞行姿态。"
    },
    {
      label: "体力消耗",
      value: "飞行姿态下每秒体力消耗增加 2.5 倍，触碰地面或体力耗尽时切换为地面姿态。"
    }
  ],

  // 被动2: 蓄雨
  20635030602: [
    {
      label: "专属蓄雨槽",
      value: "骑乘时激活独立【蓄雨】能量槽，上限 100 点，初始 0 点，骑乘过程中每帧自动回复 1 点（每秒 30 点）。"
    },
    {
      label: "属性增益",
      value: "根据当前【蓄雨】槽充盈比例提供增益：① 骑乘回血属性提升最高 +10%；② 骑乘攻击属性提升最高 +10%；③ 骑乘闪避属性提升最高 +10%；④ 全技能冷却缩减最高 -10%；⑤ 技能2充能效率提升最高 +10%。"
    },
    {
      label: "角色本体加成",
      value: "常驻提升角色本体属性：回血 +1%、回魔 +1%、攻击 +1%、闪避 +1%。"
    },
    {
      label: "水属性消耗蓄雨施加【雨湿】",
      value: "水属性攻击命中时消耗 10 点蓄雨值，并为受击目标附加【雨湿】印记（每 1 帧自然衰减 1 层，即每秒衰减 30 层，单体堆叠上限 3,700 层）：① 普攻受击 1 段附加 30 层；② 技能3水钻头追击 5 颗全中累计附加 250 层（单颗 50 层）；③ 无双技能 9 段每段均附加 90 层，全中累计附加 810 层。蓄雨值不足 10 点时不扣除蓄雨且不施加雨湿。"
    },
    {
      label: "雷属性引爆【水络电涌】",
      value: "雷属性攻击命中【雨湿】目标时引爆其雨湿层数，按 10% 基础攻击力/层结算追加伤害：技能1引爆上限 10 层（追加 100% 基础攻击力伤害）；技能2引爆上限 20 层（追加 200% 基础攻击力伤害）；技能4引爆上限 20 层（追加 200% 基础攻击力伤害）。"
    }
  ],

  // 骑术: 蓄雨·骑 (黄龙·骑术)
  20635030603: [
    {
      label: "角色属性继承",
      value: "解锁专属骑术后，额外继承角色 8% 的生命、闪避、攻击、暴击。"
    },
    {
      label: "蓄雨机制与属性加成",
      value: "专属【蓄雨】槽上限 100 点，每帧回复 1 点（每秒 30 点）。根据充盈比例提供最高 +10% 回血、+10% 攻击、+10% 闪避、-10% 冷却缩减、+10% 充能效率。"
    },
    {
      label: "角色本体加成",
      value: "常驻提升角色本体属性：回血 +1%、回魔 +1%、攻击 +1%、闪避 +1%。"
    },
    {
      label: "水属性施加【雨湿】",
      value: "水属性攻击消耗 10 点蓄雨值施加【雨湿】：① 普通攻击单次施加 30 层；② 技能3水钻头追击 5 颗全中累计施加 250 层（单颗 50 层）；③ 无双技能 9 段全中累计施加 810 层（每段 90 层）。"
    },
    {
      label: "雷属性引爆【水络电涌】",
      value: "雷属性攻击引爆【雨湿】层数（每层追加 10% 基础攻击力伤害）：① 技能1引爆上限 10 层（最高追加 100% 基础攻击力伤害）；② 技能2引爆上限 20 层（最高追加 200% 基础攻击力伤害）；③ 技能4引爆上限 20 层（最高追加 200% 基础攻击力伤害）。"
    }
  ]
  */
};

const YINGLONG_NOTES = {
  // 神天应龙
  20635010001: "水属性普攻：水刃造成1段220%伤害；消耗66点蓄雨值施加33层【雨湿】（2:1转化）；水球跟随状态下联动5颗水钻头追击。",
  20635010101: "雷属性周身5段伤害（总倍率374%），命中施加僵直；雷属性命中【雨湿】目标触发【水络电涌】追加伤害（基础上限1300层，骑术上限1826层）。",
  20635010201: "雷属性长按冲刺，前16帧检测起步，第16帧起每帧消耗300能量冲刺（最多9次），松手或缺能提前中断；雷属性命中【雨湿】目标触发【水络电涌】（基础引爆204层，骑术引爆285层）。",
  20635010301: "水属性技能：生成5颗水球跟随；1.5秒后按键激活二段治疗（锁定残血友方）；未激活二段时，普攻转为水钻头追击。",
  20635010303: "水属性普攻追击技能：5颗水球转化为水钻头造成5段共450%伤害；消耗254蓄雨值，每颗独立施加127层【雨湿】（全中累计635层，每秒自然衰减30层，上限3700层）。",
  20635010401: "雷属性飞行蓄力技：5档蓄力（上限90帧/3.0s），每帧+1.25%攻击力倍率（满蓄+112.5%）；8段判定每段叠加+112.5%，基础总倍率630%满蓄增至1530%（固伤不增伤）；附带【坐骑强韧】减少体力消耗1125点；雷属性命中【雨湿】目标触发【水络电涌】（基础上限1338层，骑术上限1873层）。",
  20635010501: "水属性无双技能：水浪弹幕造成9段共600%伤害，消耗173蓄雨值，9段每段独立施加86层【雨湿】（全中累计774层，骑术全中1962层，单体上限3700层）。",
  20635010601: "坐骑被动：二段跳后按跳跃键进入飞行姿态；飞行期间体力消耗增加2.5倍，落地切回地面姿态。",
  20635010602: "坐骑被动：激活上限3700蓄雨槽，每帧回复4点（每秒120点），根据蓄雨比例提升回血最高+10%、减CD最高-10%、技能2充能加速最高+10%、角色回血+1%回魔+0.5%；水属性攻击按2:1比例消耗蓄雨施加【雨湿】（普攻单段33层、水钻头全中635层、无双全中774层），雷属性攻击引爆【水络电涌】。",
  20635010603: "专属骑术：继承角色8%生命/回血/攻击/暴击；蓄雨槽扩容至5900且每秒回150点；回血/减CD/充能上限调至14%；角色回血+1.5%回魔+0.75%；雨湿堆叠速度提升（无双单段218层/全中1962层）；水络电涌引爆上限调整（技能2提升至285层；技能1提升至1826层；技能4提升至1873层）。",

  // 尊瑞黄龙（待官方正式上线后解开注释启用）
  /*
  20635030001: "水属性普攻：水刃造成1段220%伤害；消耗10点蓄雨值施加30层【雨湿】；水球跟随状态下联动5颗水钻头追击。",
  20635030101: "雷属性技能：周身造成5段伤害（总倍率374%），首次命中施加麻木；未命中时可激活压缩雷球二段打击；雷属性命中【雨湿】目标引爆水络电涌（上限10层，每层追加10%基础攻击力，最高+100%）。",
  20635030201: "雷属性冲刺技能：起步消耗6000能量长按冲刺，造成8段共340%伤害；充能效率随蓄雨值提升最高+10%；雷属性命中【雨湿】目标引爆水络电涌（上限20层，最高追加200%基础攻击力）。",
  20635030301: "水属性技能：生成5颗跟随水球；1.5秒后激活二段治疗，连续治疗同目标存在衰减（第2次-40%，第3~5次-90%）；未激活治疗时，普攻转为水钻头追击。",
  20635030303: "水属性普攻追击技能：5颗水球转化为水钻头造成5段共450%伤害；消耗10点蓄雨值，每颗独立施加50层【雨湿】（全中累计250层，每秒自然衰减30层，上限3700层）。",
  20635030401: "雷属性蓄力技能：5档蓄力（上限90帧/3.0s），每帧+1.25%攻击力倍率（满蓄+112.5%）；8段判定每段叠加+112.5%，基础总倍率630%满蓄增至1530%（固伤不增伤）；附带【坐骑强韧】减少体力消耗1125点；雷属性命中【雨湿】目标引爆水络电涌（上限20层，最高追加200%基础攻击力）。",
  20635030501: "水属性无双技能：水浪弹幕造成9段共600%伤害；消耗10点蓄雨值，9段每段独立施加90层【雨湿】（全中累计810层，单体上限3700层）。",
  20635030601: "坐骑被动：二段跳后按跳跃键进入飞行姿态；飞行期间体力消耗增加2.5倍，落地切回地面姿态。",
  20635030602: "坐骑被动：激活上限100蓄雨槽，每帧回复1点（每秒30点），根据蓄雨比例提升回血最高+10%、攻击最高+10%、闪避最高+10%、减CD最高-10%、技能2充能加速最高+10%、角色回血+1%回魔+1%攻击+1%闪避+1%；水属性攻击消耗10点蓄雨施加【雨湿】（普攻单段30层、水钻头全中250层、无双全中810层），雷属性攻击引爆【水络电涌】（按10%/层结算，上限10~20层）。",
  20635030603: "专属骑术：继承角色8%生命/闪避/攻击/暴击；蓄雨槽上限100且每秒回30点；回血/攻击/闪避/减CD/充能上限+10%；角色回血+1%回魔+1%攻击+1%闪避+1%；水属性消耗10蓄雨施加雨湿（普攻30层/追击250层/无双810层）；水络电涌每层追加10%基础攻击力伤害（技能1上限10层，技能2/技能4上限20层）。"
  */
};

const CFG_FALLBACK = {
  2063503: "2063501-monster_cfg_yinglong",
  2063504: "2063504-monster_cfg_huanglong_max",
};

function getFallbackSkillId(skillId) {
  const str = String(skillId);
  if (str.startsWith("2063503")) {
    return Number(str.replace("2063503", "2063501"));
  }
  return skillId;
}

const BIND_SOURCE_LABEL = {
  beSkill: "被动技能",
  beSkill2: "被动技能",
  entityActionComBuff: "技能附带",
  bulletHitBuff: "命中附带",
  bulletFirstHitBuff: "首次命中附带",
  passiveEffect: "被动效果",
  beskillEffect: "机制效果",
};

const DEFAULT_METRICS = [
  { key: "atkConv", label: "攻转", scope: "level", expr: "totalPer / releaseSeconds", when: "totalPer * releaseSeconds", fixed: 3 },
];

function idx(arr) {
  const m = new Map();
  for (const r of arr) m.set(r.id, r);
  return m;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function buffValueSummary(buff) {
  if (!buff) return null;
  let v = buff.value;
  if (Array.isArray(v) && Array.isArray(v[0])) v = v[0];
  if (Array.isArray(v)) {
    return { per: typeof v[0] === "number" ? v[0] : null, val: typeof v[1] === "number" ? v[1] : null };
  }
  return null;
}

function resolveRawBuff(buff, buffById) {
  if (!buff) return buff;
  if ((buff.value === null || buff.value === undefined) && Array.isArray(buff.attachBuff) && buff.attachBuff.length > 0) {
    const attached = buffById.get(buff.attachBuff[0]);
    if (attached) return { ...buff, value: attached.value };
  }
  return buff;
}

function loadAllRides() {
  const file = u.findTableFile("ride");
  const all = JSON.parse(fs.readFileSync(file, "utf8"));
  const map = new Map();
  for (const r of all) {
    if (r && typeof r === "object" && !Array.isArray(r) && r.cancel !== 1) {
      map.set(r.id, r);
    }
  }
  return map;
}

function resolveRideCfgFile(skill, ride, ctx, warnings) {
  const action = skill.entityAction;
  const rideMonsterIds = asArray(ride.monsterId).filter((id) => id != null);

  const order = [];
  for (const id of rideMonsterIds) {
    const m = ctx.monsterById.get(id);
    if (m) order.push(m);
  }

  for (const m of order) {
    let cfgFile = m.cfgFile;
    let cfg = eng.loadEntityCfg(cfgFile);
    if ((!cfg || Object.keys(cfg).length === 0) && CFG_FALLBACK[m.id]) {
      cfgFile = CFG_FALLBACK[m.id];
      cfg = eng.loadEntityCfg(cfgFile);
    }

    if (cfg && action && cfg[action]) {
      return {
        cfgFileResolved: cfgFile,
        cfgResolveSource: "rideMonster",
        cfgMonsterId: m.id,
        cfgMonsterName: m.name,
        hasActionCfg: true,
        actionCfg: cfg[action],
        entityCfg: cfg,
      };
    }
  }

  const firstMonster = order[0] || null;
  let firstCfgFile = firstMonster?.cfgFile;
  let firstCfg = firstMonster ? eng.loadEntityCfg(firstCfgFile) : null;
  if ((!firstCfg || Object.keys(firstCfg).length === 0) && firstMonster && CFG_FALLBACK[firstMonster.id]) {
    firstCfgFile = CFG_FALLBACK[firstMonster.id];
    firstCfg = eng.loadEntityCfg(firstCfgFile);
  }

  return {
    cfgFileResolved: firstCfgFile || null,
    cfgResolveSource: firstMonster ? "rideMonster" : null,
    cfgMonsterId: firstMonster?.id ?? null,
    cfgMonsterName: firstMonster?.name ?? null,
    hasActionCfg: false,
    actionCfg: null,
    entityCfg: firstCfg,
  };
}

function collectBuffs(concreteIds, ride, ctx, warnings) {
  const fixedBuffs = [];
  const growthBuffRefs = [];
  const seenBuffs = new Set();

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;
    const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
    const refs = eng.scanBuffs(skill, cfg.actionCfg, ctx.beskillById, warnings);

    for (const ref of refs) {
      if (seenBuffs.has(ref.baseBuffId)) continue;
      seenBuffs.add(ref.baseBuffId);

      const g1 = eng.resolveBuffGrowth(ref.baseBuffId, 1, ctx.buffById, warnings);
      if (!g1.buff) continue;
      const rawBuff1 = resolveRawBuff(g1.buff, ctx.buffById);
      const base = {
        baseBuffId: ref.baseBuffId,
        type: rawBuff1.type ?? null,
        name: rawBuff1.name || `buff${ref.baseBuffId}`,
        text: rawBuff1.text || null,
        time: rawBuff1.time ?? null,
        bindSource: ref.bindSource,
        bindLabel: BIND_SOURCE_LABEL[ref.bindSource] || ref.bindSource,
        levelMode: g1.levelMode,
      };

      if (g1.levelMode === "growth") growthBuffRefs.push(base);
      else fixedBuffs.push({ ...base, value: buffValueSummary(rawBuff1) });
    }
  }

  return { fixedBuffs, growthBuffRefs };
}

function computeRideLevel(displaySkillId, concreteIds, level, ride, slotKind, ctx, warnings) {
  if (slotKind === "passive") {
    return {
      level: 1,
      roleLevel: null,
      consumeMp: null,
      soulCost: null,
      kind: "effectOnly",
      segments: [],
      totalPer: null,
      totalVal: null,
      addDefendVal: null,
    };
  }

  // 技能3【澜汐凝珠】为纯召唤/智能治疗机制入口，清除0.001占位符伤害
  if (displaySkillId === 20635010301 || displaySkillId === 20635030301) {
    const skill = ctx.skillById.get(displaySkillId);
    const fbSkill = ctx.skillById.get(getFallbackSkillId(displaySkillId));
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) || (fbSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(fbSkill, level)) : null);
    return {
      level,
      roleLevel: row?.roleLevel ?? null,
      consumeMp: row?.consumeMp ?? null,
      soulCost: row?.soulCost ?? null,
      kind: "effectOnly",
      segments: [],
      totalPer: null,
      totalVal: null,
      addDefendVal: row?.addDefendVal ?? null,
    };
  }

  // 普攻【普攻1】(20635010001 / 20635030001): 扇形水刃斩击，单体受击1段 220%
  if (displaySkillId === 20635010001 || displaySkillId === 20635030001) {
    const skill = ctx.skillById.get(displaySkillId);
    const fbSkill = ctx.skillById.get(getFallbackSkillId(displaySkillId));
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level)) || (fbSkill ? ctx.skillLevelById.get(eng.skillLevelRowId(fbSkill, level)) : null);
    return {
      level: 1,
      roleLevel: row?.roleLevel ?? 1,
      consumeMp: 0,
      soulCost: null,
      kind: "normalActionBullet",
      segments: [{ per: 2.2, val: 1, maxHit: 1, from: "水刃斩击" }],
      totalPer: 2.2,
      totalVal: 1,
      addDefendVal: row?.addDefendVal ?? 220,
    };
  }

  let mergedSegments = [];
  let mergedKind = null;
  let firstRow = null;

  for (const skillId of concreteIds) {
    const skill = ctx.skillById.get(skillId);
    if (!skill) continue;

    let row = ctx.skillLevelById.get(eng.skillLevelRowId(skill, level));
    if (!row) {
      const fbSkill = ctx.skillById.get(getFallbackSkillId(skill.id));
      if (fbSkill) {
        row = ctx.skillLevelById.get(eng.skillLevelRowId(fbSkill, level));
      }
    }
    if (!row) {
      warnings.push({ code: eng.WARN.MISSING_SKILL_LEVEL, detail: `skill ${skill.id} lv${level} 缺失` });
      continue;
    }
    if (!firstRow) firstRow = row;

    const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
    const dmg = eng.computeDamageSegments(skill, row, cfg.actionCfg, warnings);
    if (dmg.segments && dmg.segments.length) {
      mergedSegments.push(...dmg.segments);
      if (!mergedKind || mergedKind === "normal") mergedKind = dmg.kind;
    }
  }

  if (!firstRow) return null;
  if (mergedSegments.some((s) => s.per > 0)) mergedSegments = mergedSegments.filter((s) => s.per > 0);

  // 技能4【神雷破空】：弹幕组件与伤害数组按时间轴触发
  if (displaySkillId === 20635010401 || displaySkillId === 20635030401) {
    const s4Skill = ctx.skillById.get(20635010403);
    const row = ctx.skillLevelById.get(eng.skillLevelRowId(s4Skill, level));
    if (row && Array.isArray(row.bulletDamageAddPer) && row.bulletDamageAddPer[0]) {
      const perArr = row.bulletDamageAddPer[0];
      const valArr = row.bulletDamageAddVal[0];
      mergedSegments = [
        { per: perArr[0], val: valArr[0], maxHit: 1, from: "起手判定" },
        { per: perArr[1], val: valArr[1], maxHit: 6, from: "持续连击" },
        { per: perArr[2], val: valArr[2], maxHit: 1, from: "终段浮空" },
      ];
      mergedKind = "bullet";
    }
  }

  // 技能3·追击【澜汐凝珠·水钻头】：5颗跟随水球全中造成5段打击
  if (displaySkillId === 20635010303 || displaySkillId === 20635030303) {
    for (const s of mergedSegments) {
      s.maxHit = 5;
    }
  }

  let totalPer = 0;
  let totalVal = 0;
  for (const s of mergedSegments) {
    totalPer += (s.per || 0) * (s.maxHit || 1);
    totalVal += (s.val || 0) * (s.maxHit || 1);
  }

  return {
    level,
    roleLevel: firstRow.roleLevel ?? null,
    consumeMp: firstRow.consumeMp ?? null,
    soulCost: firstRow.soulCost ?? null,
    kind: mergedKind || "normal",
    segments: mergedSegments,
    totalPer: round(totalPer),
    totalVal: round(totalVal),
    addDefendVal: firstRow.addDefendVal ?? null,
  };
}

function buildSkillCard(displaySkillId, ride, slotLabel, slotKind, ctx) {
  const warnings = [];
  const skill = ctx.skillById.get(displaySkillId);
  if (!skill) {
    return { skillId: displaySkillId, name: `技能${displaySkillId}`, error: "skill 不存在", warnings: [{ code: eng.WARN.MISSING_SKILL }] };
  }

  // 技能4使用skill4_3直接读取雷柱伤害，避免skill4_2(仅lv1蓄力动作)报缺失
  const concreteIds = (slotKind === "passive" || slotKind === "attack")
    ? [displaySkillId]
    : (displaySkillId === 20635010401 || displaySkillId === 20635030401)
      ? [displaySkillId === 20635030401 ? 20635030403 : 20635010403]
      : (displaySkillId === 20635010301 || displaySkillId === 20635030301)
        ? [displaySkillId]
        : (displaySkillId === 20635010303 || displaySkillId === 20635030303)
          ? [displaySkillId]
          : eng.resolveConcreteSkills(displaySkillId, ctx.skillById, warnings);
  const cfg = resolveRideCfgFile(skill, ride, ctx, warnings);
  const fbSkill = ctx.skillById.get(getFallbackSkillId(skill.id));
  const maxLevel = (slotKind === "passive" || slotKind === "attack")
    ? 1
    : (eng.detectMaxLevel(skill, ctx.skillLevelById) || (fbSkill ? eng.detectMaxLevel(fbSkill, ctx.skillLevelById) : 1));
  const rel = slotKind === "passive"
    ? { releaseFrames: null, releaseSeconds: null, releaseTimeSource: "effectOnly" }
    : (displaySkillId === 20635010303 || displaySkillId === 20635030303)
      ? { releaseFrames: 0, releaseSeconds: 0, releaseTimeSource: "instantChase" }
      : eng.resolveReleaseTime(cfg.entityCfg, skill.entityAction, cfg.hasActionCfg, warnings);

  const { fixedBuffs, growthBuffRefs } = collectBuffs(concreteIds, ride, ctx, warnings);
  const levels = [];
  for (let lv = 1; lv <= maxLevel; lv++) {
    const l = computeRideLevel(displaySkillId, concreteIds, lv, ride, slotKind, ctx, warnings);
    if (!l) continue;
    l.growthBuffs = growthBuffRefs.map((ref) => {
      const g = eng.resolveBuffGrowth(ref.baseBuffId, lv, ctx.buffById, warnings);
      const rawBuffG = resolveRawBuff(g.buff, ctx.buffById);
      return { name: ref.name, bindLabel: ref.bindLabel, time: ref.time, value: buffValueSummary(rawBuffG) };
    });
    levels.push(l);
  }

  const reference = levels[levels.length - 1] || levels[0] || null;
  const isS3Summon = displaySkillId === 20635010301 || displaySkillId === 20635030301;
  const isS3Chase = displaySkillId === 20635010303 || displaySkillId === 20635030303;
  const isAttack = displaySkillId === 20635010001 || displaySkillId === 20635030001;
  const isHuanglong = String(displaySkillId).startsWith("2063503");

  const desIntro = isAttack
    ? (isHuanglong
      ? "向前释放水流刃波，地面与飞行姿态均可释放，造成 1 段 220% 水属性伤害。命中目标消耗 10 点【蓄雨】值，施加 30 层【雨湿】状态。若处于【澜汐凝珠】跟随状态，普攻联动 5 颗水球转化为水钻头攻击目标。"
      : "向前释放水刃，地面与飞行姿态均可释放，造成 1 段 220% 水属性伤害。命中目标消耗 66 点【蓄雨】值，施加 33 层【雨湿】状态（转化比例为每 2 点蓄雨提供 1 层雨湿）。若处于【澜汐凝珠】跟随状态，普攻联动 5 颗水球转化为水钻头攻击目标。")
    : (isS3Chase
      ? (isHuanglong
        ? "水球跟随状态下，发动任意普通攻击（地面普攻或空中跳攻）将消耗 10 点蓄雨值，将 5 颗跟随水球转化为水钻头攻击目标，造成 5 段共 450% 水属性伤害，每颗独立施加 50 层【雨湿】状态（全中累计 250 层）。"
        : "水球跟随状态下，发动任意普通攻击（地面普攻或空中跳攻）将消耗 254 点蓄雨值，将 5 颗跟随水球转化为水钻头攻击目标，造成 5 段共 450% 水属性伤害并施加 127 层【雨湿】状态（2:1转化）。")
      : (skill.desIntro || null));

  const card = {
    skillId: displaySkillId,
    name: isAttack ? "普攻" : (isS3Chase ? "澜汐凝珠·水钻头" : (skill.desName || skill.Name || `技能${displaySkillId}`)),
    icon: skill.icon || null,
    attribute: skill.attribute ?? null,
    entityAction: skill.entityAction || null,
    concreteSkillIds: concreteIds,
    desIntro,
    header: {
      kind: isS3Summon ? "effectOnly" : (reference ? reference.kind : null),
      segments: isS3Summon ? [] : (reference ? reference.segments.map((s) => ({ per: s.per, maxHit: s.maxHit, from: s.from })) : []),
      segCount: isS3Summon ? 0 : (reference ? reference.segments.reduce((a, s) => a + (s.maxHit || 1), 0) : 0),
      totalPer: isS3Summon ? null : (reference ? reference.totalPer : null),
      releaseFrames: rel.releaseFrames,
      releaseSeconds: rel.releaseSeconds,
      releaseTimeSource: rel.releaseTimeSource,
      cd: (displaySkillId === 20635010501 || displaySkillId === 20635030501) ? 21 : (isS3Chase ? 25 : (isAttack ? 0 : (skill.cd ?? null))),
      addDefendVal: skill.addDefendVal ?? null,
      cfgFileResolved: cfg.cfgFileResolved,
      cfgResolveSource: cfg.cfgResolveSource,
      referenceLevel: reference?.level ?? null,
      fixedBuffs,
      mechanics: YINGLONG_MECHANICS[displaySkillId] || [],
      note: YINGLONG_NOTES[displaySkillId] || null,
      metrics: isS3Summon ? [] : metrics.computeMetrics(
        ctx.metricDefs, "header",
        { skillId: displaySkillId, totalPer: reference ? reference.totalPer : null, releaseSeconds: rel.releaseSeconds, segCount: reference ? reference.segments.reduce((a, s) => a + (s.maxHit || 1), 0) : 0 },
        ctx.helpers, warnings,
      ),
    },
    maxLevel,
    slotLabel,
    slotKind,
    levels: levels.map((l) => ({
      level: l.level,
      roleLevel: l.roleLevel,
      consumeMp: l.consumeMp,
      soulCost: l.soulCost,
      segmentVals: l.segments.map((s) => ({ val: s.val, maxHit: s.maxHit })),
      totalPer: l.totalPer,
      totalVal: l.totalVal,
      growthBuffs: l.growthBuffs || [],
      metrics: isS3Summon ? [] : metrics.computeMetrics(
        ctx.metricDefs, "level",
        { skillId: displaySkillId, level: l.level, roleLevel: l.roleLevel, consumeMp: l.consumeMp, totalPer: l.totalPer, totalVal: l.totalVal, growthBuffs: l.growthBuffs || [], releaseSeconds: rel.releaseSeconds, segCount: l.segments.reduce((a, s) => a + (s.maxHit || 1), 0) },
        ctx.helpers, l.level === 1 ? warnings : [],
      ),
    })),
    warnings,
  };

  return card;
}

function buildSlots(ride, ctx) {
  /*
  // 尊瑞黄龙专属槽位定义（待官方正式上线后解开注释启用）
  if (ride.id === 201904) {
    const huanglongSlots = [
      { slot: "attack1", slotLabel: "普攻", slotKind: "attack", skillId: 20635030001 },
      { slot: "skillActive1", slotLabel: "技能1", slotKind: "active", skillId: 20635030101 },
      { slot: "skillActive2", slotLabel: "技能2", slotKind: "active", skillId: 20635030201 },
      { slot: "skillActive3", slotLabel: "技能3", slotKind: "active", skillId: 20635030301 },
      { slot: "skillActive3_chase", slotLabel: "技能3·追击", slotKind: "active", skillId: 20635030303 },
      { slot: "skillActive4", slotLabel: "技能4", slotKind: "active", skillId: 20635030401 },
      { slot: "skillSp1", slotLabel: "无双", slotKind: "sp", skillId: 20635030501 },
      { slot: "skillPassive1", slotLabel: "被动", slotKind: "passive", skillId: 20635030601 },
      { slot: "skillPassive2", slotLabel: "被动", slotKind: "passive", skillId: 20635030602 },
      { slot: "riding1", slotLabel: "骑术", slotKind: "passive", skillId: 20635030603 },
    ];
    return huanglongSlots.map((s) => ({
      slot: s.slot,
      slotLabel: s.slotLabel,
      slotKind: s.slotKind,
      base: buildSkillCard(s.skillId, ride, s.slotLabel, s.slotKind, ctx),
    }));
  }
  */

  const slots = [];
  for (const def of SLOT_DEFS) {
    let ids = [];
    if (def.kind === "attack") {
      ids = asArray(ctx.monsterById.get(ride.monsterId)?.atkIds).filter(Boolean);
    } else if (def.key === "riding") {
      const ridingItem = ctx.ridingList?.find((r) => r.rideGroupId === ride.idGroup);
      if (ridingItem && ridingItem.skills) {
        // 排除已被普通被动收录的羽嘉之翼 (20635010601)
        ids = ridingItem.skills.filter((sId) => sId !== 20635010601);
      }
    } else {
      ids = asArray(ride[def.key]).filter(Boolean);
    }
    ids.forEach((skillId, index) => {
      const slotLabel = def.kind === "attack" || def.kind === "sp" || def.kind === "passive" || def.key === "riding" ? def.labelPrefix : `${def.labelPrefix}${index + 1}`;
      slots.push({
        slot: def.kind === "attack" ? `attack${index + 1}` : `${def.key}${index + 1}`,
        slotLabel,
        slotKind: def.kind,
        base: buildSkillCard(skillId, ride, slotLabel, def.kind, ctx),
      });

      // 针对技能3: 澜汐凝珠 (20635010301) 追加【技能3·追击】水钻头卡片
      if (skillId === 20635010301) {
        const chaseSkillId = 20635010303;
        const chaseLabel = "技能3·追击";
        slots.push({
          slot: `${def.key}${index + 1}_chase`,
          slotLabel: chaseLabel,
          slotKind: "active",
          base: buildSkillCard(chaseSkillId, ride, chaseLabel, "active", ctx),
        });
      }
    });
  }
  return slots;
}

function extract() {
  console.log("\n🐲 坐骑技能 Wiki → 应龙");

  const ctx = {
    rideById: loadAllRides(),
    skillById: idx(u.loadTable("skill")),
    skillLevelById: idx(u.loadTable("skillLevel")),
    monsterById: idx(u.loadTable("monster")),
    buffById: idx(u.loadTable("buff")),
    beskillById: idx(u.loadTable("beskill")),
    ridingList: Object.values(u.loadTable("riding")),
    standards: metrics.loadCommonStandards(),
  };
  ctx.metricDefs = DEFAULT_METRICS;
  ctx.helpers = {
    standard: (roleLevel) => (roleLevel != null ? (ctx.standards.get(roleLevel) ?? null) : null),
    buffValue: (baseBuffId, valuePath, level) => {
      const g = eng.resolveBuffGrowth(Number(baseBuffId), level, ctx.buffById, []);
      const raw = resolveRawBuff(g.buff, ctx.buffById);
      if (!raw) return null;
      const parts = String(valuePath).split(".");
      let current = raw;
      for (const part of parts) current = current == null ? undefined : current[part];
      return typeof current === "number" ? current : null;
    },
  };

  const variants = RIDE_IDS.map((rideId) => {
    const ride = ctx.rideById.get(rideId);
    if (!ride) throw new Error(`ride ${rideId} 不存在`);
    const monster = ctx.monsterById.get(Array.isArray(ride.monsterId) ? ride.monsterId[0] : ride.monsterId);
    return {
      ride: {
        id: ride.id,
        idGroup: ride.idGroup,
        name: ride.name,
        rank: ride.rank,
        type: ride.type,
        monsterId: ride.monsterId,
        monsterName: monster?.name || null,
        cfgFile: monster?.cfgFile || null,
      },
      slots: buildSlots(ride, ctx),
    };
  });

  const payload = {
    rideGroup: {
      key: "yinglong",
      name: "应龙",
      rideIds: RIDE_IDS,
      note: "神天应龙坐骑技能 Wiki，包含蓄雨、飞行姿态、充能蓄力及 1~60 级成长数值。",
    },
    variants,
  };

  u.saveOutput("ride_wiki_yinglong", payload, {
    system: "ride_wiki",
    sourceFiles: ["ride.*.json", "skill.*.json", "skillLevel.*.json", "monster.*.json", "beskill.*.json", "buff.*.json", "bullets.json", "entityCtg/*.json"],
    note: "神天应龙超进化形态坐骑技能 Wiki。",
  });

  for (const v of variants) {
    console.log(`  ${v.ride.name}(${v.ride.id}) cfg=${v.ride.cfgFile}`);
    for (const s of v.slots) {
      const b = s.base;
      const top = b.levels && b.levels[b.levels.length - 1];
      console.log(`    ${s.slotLabel} ${b.name}(${b.skillId}): ${b.header.kind} ${b.header.segCount}段 per=${b.header.totalPer} 帧=${b.header.releaseFrames} maxLv=${b.maxLevel}${b.warnings.length ? " ⚠" + b.warnings.length : ""}`);
      if (top && top.totalPer !== b.header.totalPer) console.log(`      满级 per=${top.totalPer}`);
    }
  }
}

if (require.main === module) extract();
module.exports = extract;
