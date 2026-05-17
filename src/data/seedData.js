export const stores = ['龙泉1店', '龙泉2店', '龙泉金龙店', '郫县1店']

export const statusOptions = ['正常', '30天未到店', '60天未到店', '90天未到店', '已流失']
export const levelOptions = ['A客/VIP', 'B客', 'C客']
export const followStatusOptions = ['未联系', '已微信', '已电话', '已预约', '已到店', '暂不考虑', '无效客户']
export const followMethods = ['微信', '电话', '到店沟通']
export const issueOptions = ['没时间', '没需求', '价格顾虑', '身体不舒服', '对项目不了解', '服务不满意', '其他']

const today = new Date()

const dateDaysAgo = (days) => {
  const date = new Date(today)
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

const dateDaysLater = (days) => {
  const date = new Date(today)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const names = [
  '王丽华', '张雅琴', '李美兰', '赵静怡', '刘芳芳', '陈慧敏', '杨小梅', '黄淑芬',
  '周雪', '吴佳妮', '徐春梅', '孙丽娜', '胡敏', '朱玉珍', '高雯', '林秀英',
  '何晓燕', '郭佳慧', '马玲', '罗婷婷', '梁美琪', '宋芳', '郑丽', '唐婉',
  '谢红梅', '冯月', '邓静', '曹欣', '彭玉兰', '曾丽萍', '萧雅', '田莉',
  '董慧', '袁雪梅', '潘晓丽', '蒋蓉', '蔡文静', '余珊', '杜丽', '叶敏',
  '程雨晴', '江婉婷', '苏梦', '魏晓霞',
]

const owners = ['林娜', '陈思思', '周敏', '唐悦', '何倩', '赵晴', '罗萍', '郑雅']

const dayBuckets = [8, 12, 18, 23, 29, 31, 35, 42, 48, 55, 61, 66, 73, 82, 88, 91, 98, 106, 118, 132]

export const makeCustomerStatus = (days) => {
  if (days >= 120) return '已流失'
  if (days >= 90) return '90天未到店'
  if (days >= 60) return '60天未到店'
  if (days >= 30) return '30天未到店'
  return '正常'
}

export const initialEmployees = [
  { id: 'emp-1', name: '刘店长', store: '龙泉1店', role: 'manager', today_followups: 12, today_appointments: 5, today_arrivals: 3, today_deals: 1, today_sales: 6800 },
  { id: 'emp-2', name: '林娜', store: '龙泉1店', role: 'beautician', today_followups: 18, today_appointments: 6, today_arrivals: 4, today_deals: 2, today_sales: 9200 },
  { id: 'emp-3', name: '陈思思', store: '龙泉2店', role: 'beautician', today_followups: 16, today_appointments: 4, today_arrivals: 3, today_deals: 1, today_sales: 5800 },
  { id: 'emp-4', name: '王店长', store: '龙泉2店', role: 'manager', today_followups: 10, today_appointments: 3, today_arrivals: 2, today_deals: 1, today_sales: 4200 },
  { id: 'emp-5', name: '周敏', store: '龙泉金龙店', role: 'beautician', today_followups: 21, today_appointments: 8, today_arrivals: 5, today_deals: 3, today_sales: 12400 },
  { id: 'emp-6', name: '唐悦', store: '龙泉金龙店', role: 'beautician', today_followups: 14, today_appointments: 5, today_arrivals: 4, today_deals: 2, today_sales: 7600 },
  { id: 'emp-7', name: '何倩', store: '郫县1店', role: 'beautician', today_followups: 20, today_appointments: 7, today_arrivals: 5, today_deals: 3, today_sales: 13800 },
  { id: 'emp-8', name: '赵晴', store: '郫县1店', role: 'beautician', today_followups: 13, today_appointments: 4, today_arrivals: 3, today_deals: 1, today_sales: 5200 },
]

export const initialCustomers = names.map((name, index) => {
  const days = dayBuckets[index % dayBuckets.length] + (index > 20 ? 4 : 0)
  const store = stores[index % stores.length]
  const owner = owners[index % owners.length]
  const level = index % 7 === 0 ? 'A客/VIP' : index % 3 === 0 ? 'C客' : 'B客'

  return {
    id: `cus-${index + 1}`,
    name,
    phone: `13${(720000000 + index * 7139).toString().slice(0, 9)}`,
    store,
    owner,
    level,
    lastVisit: dateDaysAgo(days),
    lastFollowResult: index % 4 === 0 ? '已微信，等待回复' : index % 4 === 1 ? '电话沟通，有兴趣' : index % 4 === 2 ? '已预约本周到店' : '未联系',
    nextFollowTime: dateDaysLater((index % 6) + 1),
    followStatus: followStatusOptions[index % followStatusOptions.length],
  }
})

export const initialFollowups = [
  {
    id: 'fol-1',
    customerId: 'cus-6',
    customerName: '陈慧敏',
    method: '微信',
    owner: '林娜',
    content: '提醒肩颈护理剩余次数，邀约周末到店。',
    feedback: '最近肩颈酸痛，愿意安排时间。',
    hasAppointment: true,
    appointmentTime: dateDaysLater(2),
    hasDeal: false,
    dealAmount: 0,
    nextFollowTime: dateDaysLater(1),
    issueType: '没时间',
  },
  {
    id: 'fol-2',
    customerId: 'cus-12',
    customerName: '孙丽娜',
    method: '电话',
    owner: '周敏',
    content: '沟通艾灸调理周期，介绍本月回店福利。',
    feedback: '认可项目，预约体验加强。',
    hasAppointment: true,
    appointmentTime: dateDaysLater(1),
    hasDeal: true,
    dealAmount: 3980,
    nextFollowTime: dateDaysLater(7),
    issueType: '对项目不了解',
  },
]

export const initialReviews = [
  {
    id: 'rev-1',
    date: today.toISOString().slice(0, 10),
    store: '龙泉1店',
    targetInvites: 25,
    wechatCount: 18,
    phoneCount: 10,
    appointments: 9,
    visits: 6,
    deals: 4,
    revenue: 16800,
    reason: '部分 90 天顾客电话接通率偏低',
    staffIssue: '邀约话术不够聚焦身体问题',
    rejectReason: '没时间、价格顾虑',
    tomorrowAction: 'A 客由店长二次跟进，美容师补发护理建议',
    summary: '今日整体完成较好，需提高高风险客户回访质量。',
  },
]
