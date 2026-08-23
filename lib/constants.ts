import type { MentorId, Profile } from "./types";

export const MENTOR_META: Record<MentorId, { name: string; short: string; icon: string }> = {
  builder: { name: "第一性原理建造者", short: "拆解问题，创造方案", icon: "构" },
  investor: { name: "长期复利配置者", short: "积累能力，保留选择", icon: "长" },
  storyteller: { name: "用户体验叙事者", short: "理解人，表达体验", icon: "人" },
};

export const TASK_OPTIONS = ["访谈与观察", "梳理复杂信息", "提出创意", "做原型", "写作表达", "数据分析", "协调推进", "独立深挖"];
export const VALUE_OPTIONS = ["成长速度", "工作意义", "稳定性", "创造空间", "收入潜力", "生活平衡", "团队氛围", "远程自由"];

export const EMPTY_PROFILE: Profile = {
  experience: "",
  responsibility: "",
  likedTasks: [],
  dislikedTasks: [],
  skills: "",
  weeklyTime: "5—8 小时",
  budget: "500 元以内",
  location: "北京，可接受远程",
  workValues: [],
};

export const EXAMPLE_PROFILE: Profile = {
  experience: "我在毕业设计中重新设计了校园心理咨询预约体验。因为同学常常不知道该选哪类咨询，我访谈了 8 位同学和 2 位老师，把预约前的犹豫点画成旅程图，并做了一个可点击原型。",
  responsibility: "我负责访谈提纲、用户访谈、信息整理、流程设计和原型展示。最终老师采用了其中的预约前说明结构，但我没有真实上线数据。",
  likedTasks: ["访谈与观察", "梳理复杂信息", "做原型"],
  dislikedTasks: ["数据分析", "协调推进"],
  skills: "Figma、用户访谈、信息架构、基础视觉设计、课堂展示",
  weeklyTime: "5—8 小时",
  budget: "500 元以内",
  location: "北京，可接受远程",
  workValues: ["成长速度", "工作意义", "创造空间"],
};
