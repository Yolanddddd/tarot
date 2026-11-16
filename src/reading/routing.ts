import type { SpreadId } from '../config/spreads';
import type { ReadingCategory } from './types';

export interface RoutingDecision {
  category: ReadingCategory;
  spreadId: SpreadId;
  reason: string;
}

export function routeQuestion(question: string): RoutingDecision {
  const text = question.trim().toLowerCase();
  const category: ReadingCategory = /phd|博士|读博|导师|funding/.test(text) ? 'phd'
    : /offer|申请|录取|梦校|大学|硕士|英本/.test(text) ? 'application'
    : /intern|graduate|placement|实习|求职|工作|面试/.test(text) ? 'career'
    : /考试|成绩|毕业|学位|论文|挂科|学业/.test(text) ? 'study'
    : /感情|朋友|关系|室友/.test(text) ? 'relationships' : 'general';

  if (/本月|这个月|下个月|月度|未来一个月|\d{1,2}月.*运势/.test(text)) {
    return { category, spreadId: 'monthlyFlow', reason: '问题关注一个月内多个生活面向，适合按学业、人际和自我状态展开。' };
  }
  if (/选择|选哪个|二选一|比较|还是|取舍|权衡|同时|两所|两个|多个/.test(text)) {
    return { category, spreadId: 'hexagram', reason: '问题涉及多个影响因素或选择，适合从七个角度梳理。' };
  }
  return { category, spreadId: 'futureCross', reason: '问题聚焦一个具体目标，适合看清现状、阻碍与下一步。' };
}
