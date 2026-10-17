export const LocalNotifications = {
  display: 'prompt', exact: 'denied', pending: [], scheduled: [], calls: [], actionListeners: new Set(),
  checkPermissions: async () => ({ display: LocalNotifications.display }),
  requestPermissions: async () => { LocalNotifications.calls.push('requestPermissions'); LocalNotifications.display = LocalNotifications.willGrant === false ? 'denied' : 'granted'; return { display: LocalNotifications.display } },
  getPending: async () => ({ notifications: LocalNotifications.pending.map((id) => ({ id })) }),
  cancel: async ({ notifications }) => { LocalNotifications.calls.push(`cancel:${notifications.length}`); LocalNotifications.pending = [] },
  schedule: async ({ notifications }) => { LocalNotifications.calls.push(`schedule:${notifications.length}`); LocalNotifications.scheduled = notifications; LocalNotifications.pending = notifications.map((n) => n.id) },
  checkExactNotificationSetting: async () => ({ exact_alarm: LocalNotifications.exact }),
  changeExactNotificationSetting: async () => { LocalNotifications.calls.push('changeExact') },
  addListener: async (name, fn) => { LocalNotifications.actionListeners.add(fn); return { remove: () => LocalNotifications.actionListeners.delete(fn) } },
}
