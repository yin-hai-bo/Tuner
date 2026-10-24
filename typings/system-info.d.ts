// Base library >= 2.20.1. Supplement the bundled 2021 typings with the fields used.
declare namespace WechatMiniprogram {
  interface Wx {
    getAppBaseInfo(): Pick<SystemInfo, 'language'>
    getDeviceInfo(): Pick<SystemInfo, 'platform'>
  }
}
