import React from 'react';
import CostBadge from '../ui/CostBadge';
import { clsx } from 'clsx';

interface Props {
    dataSources: Record<string, any>;
}

export default function FashionBall({ dataSources }: Props) {
    const ballData = dataSources['role_fashion_ball']?.data || [];

    // Attribute mapper to labels & colors
    const getAttrMeta = (key: string) => {
        const map: Record<string, { label: string, color: string }> = {
            atk: { label: '攻击', color: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20' },
            hp: { label: '生命', color: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20' },
            mp: { label: '魔法', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
            def: { label: '防御', color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20' },
            healMp: { label: '回魔', color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20' },
            healHp: { label: '回血', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
            hitVal: { label: '命中', color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20' },
            dodge: { label: '闪避', color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20' },
            crit: { label: '暴击', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
            tenacity: { label: '韧性', color: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20' },
            lucky: { label: '幸运', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-500/20' },
            guardian: { label: '守护', color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20' }
        };
        return map[key] || { label: key, color: 'bg-slate-500/[0.04] text-textSub border-border/50' };
    };

    const processedData = React.useMemo(() => {
        let totalExp = 0;
        let totalYuanbao = 0;

        return ballData.map((rankGroup: any) => {
            const levels = (rankGroup.levels || []).map((lvl: any) => {
                const stepCount = lvl.upResources?.count || 0;
                const itemId = lvl.upResources?.itemId;
                if (itemId === 6) totalExp += stepCount;

                return {
                    ...lvl,
                    totalExp,
                    totalYuanbao
                };
            });

            let breakthrough = null;
            if (rankGroup.breakthrough) {
                const btCount = rankGroup.breakthrough.upResources?.count || 0;
                totalYuanbao += btCount;
                breakthrough = {
                    ...rankGroup.breakthrough,
                    totalExp,
                    totalYuanbao
                };
            }

            return {
                ...rankGroup,
                levels,
                breakthrough
            };
        });
    }, [ballData]);

    if (!ballData.length) {
        return <div className="text-center text-textSub p-10 font-mono text-xs">等待时装宝珠数据...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="card p-6 border border-border/60 bg-card relative overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <div>
                        <h2 className="text-lg font-bold text-textMain uppercase tracking-wider">时装宝珠系统</h2>
                        <p className="text-xs text-textSub mt-1">
                            每阶内含 1~12 级时装经验升级（单项属性依次递增）；满 12 级后进行升阶突破，消耗元宝/点券获得全属性大幅提升。
                        </p>
                    </div>
                </div>

                <div
                    className="grid gap-6 relative z-10 items-start"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))' }}
                >
                    {processedData.map((rankGroup: any) => (
                        <div key={rankGroup.rank} className="border border-border/60 rounded-xl bg-slate-500/[0.01] dark:bg-white/[0.01] relative flex flex-col shadow-sm">
                            <div className="px-5 py-3 bg-surface/95 backdrop-blur-md border-b border-border/40 flex justify-between items-center sticky top-0 z-20 rounded-t-xl">
                                <h3 className="text-sm font-bold text-purple-600 dark:text-purple-400">
                                    【{rankGroup.rank}阶】 时装宝珠
                                </h3>
                                {rankGroup.isMaxRank && (
                                    <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 font-bold">
                                        最高阶满级
                                    </span>
                                )}
                            </div>

                            <div className="p-4 flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                {/* 最高阶卡片 */}
                                {rankGroup.isMaxRank && (
                                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                                        <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                            20阶时装宝珠（已达满级）
                                        </div>
                                        <div className="text-xs text-textSub">
                                            已激活全属性 +{Math.round(Number(rankGroup.attributeValue?.atk || 0) * 100)}% 顶级加成。
                                        </div>
                                    </div>
                                )}

                                {/* 本阶逐级升级列表 */}
                                {rankGroup.levels.map((lvl: any) => {
                                    const attrs = lvl.attributeValue ? Object.entries(lvl.attributeValue) : [];

                                    return (
                                        <div key={lvl.id || lvl.level} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border bg-card border-border/40 hover:border-border shadow-sm transition-colors">
                                            {/* Level Badge */}
                                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                                <div className="font-mono font-bold text-xs px-2 py-1 rounded-md bg-surface text-textMain border border-border">
                                                    Lv.{lvl.level}
                                                </div>
                                                <span className="text-[10px] text-textSub font-mono">
                                                    {lvl.stepLabel}
                                                </span>
                                            </div>

                                            {/* Attributes */}
                                            <div className="flex-1 flex flex-wrap items-center gap-2">
                                                {attrs.map(([k, v]) => {
                                                    const meta = getAttrMeta(k);
                                                    return (
                                                        <div key={k} className={clsx("flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-medium", meta.color)}>
                                                            <span>{meta.label}</span>
                                                            <span className="font-mono font-bold">+{Math.round(Number(v) * 100)}%</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Costs */}
                                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0 pt-2 sm:pt-0 border-t border-border/30 sm:border-0 mt-2 sm:mt-0">
                                                {lvl.upResources ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-textSub block sm:hidden">消耗:</span>
                                                        <CostBadge
                                                            itemId={lvl.upResources.itemId}
                                                            name={lvl.upResources.name}
                                                            count={lvl.upResources.count}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-textSub/50 text-[10px] hidden sm:block">-</span>
                                                )}

                                                {lvl.totalExp > 0 && (
                                                    <div className="text-[9px] flex gap-1.5 font-mono bg-black/5 dark:bg-white/5 px-2 py-1 rounded">
                                                        <span className="text-emerald-800 dark:text-green-500">累计经验: {lvl.totalExp.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* 阶末升阶突破 */}
                                {rankGroup.breakthrough && (
                                    <div className="p-3.5 rounded-xl border border-purple-500/40 bg-purple-500/[0.04] dark:bg-purple-500/[0.08] space-y-2.5 mt-1 shadow-sm">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                                                    {rankGroup.breakthrough.stepLabel}
                                                </span>
                                                {rankGroup.breakthrough.upLevelLimits && (
                                                    <span className="text-[10px] font-mono text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                                        要求角色 {rankGroup.breakthrough.upLevelLimits} 级
                                                    </span>
                                                )}
                                            </div>
                                            {rankGroup.breakthrough.upResources && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-textSub">突破消耗:</span>
                                                    <CostBadge
                                                        itemId={rankGroup.breakthrough.upResources.itemId}
                                                        name={rankGroup.breakthrough.upResources.name}
                                                        count={rankGroup.breakthrough.upResources.count}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-500/20">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-textSub">突破奖励:</span>
                                                <span className="text-[11px] text-purple-700 dark:text-purple-300 font-bold bg-purple-500/15 dark:bg-purple-500/25 px-2.5 py-1 rounded border border-purple-500/30">
                                                    全属性 +{Math.round(Number(Object.values(rankGroup.breakthrough.attributeValue || {})[0] || 0) * 100)}%
                                                </span>
                                            </div>
                                            {rankGroup.breakthrough.totalYuanbao > 0 && (
                                                <span className="text-[9px] font-mono text-amber-600 dark:text-yellow-600 bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded">
                                                    累计元宝: {rankGroup.breakthrough.totalYuanbao.toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
