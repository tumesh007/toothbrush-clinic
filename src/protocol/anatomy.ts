export type Surface = 'outer' | 'inner' | 'chewing';

export const UPPER_RIGHT_TEETH = ['ur_m2', 'ur_m1', 'ur_pm2', 'ur_pm1', 'ur_c', 'ur_li', 'ur_ci'] as const;
export const UPPER_LEFT_TEETH = ['ul_ci', 'ul_li', 'ul_c', 'ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2'] as const;
export const LOWER_RIGHT_TEETH = ['lr_m2', 'lr_m1', 'lr_pm2', 'lr_pm1', 'lr_c', 'lr_li', 'lr_ci'] as const;
export const LOWER_LEFT_TEETH = ['ll_ci', 'll_li', 'll_c', 'll_pm1', 'll_pm2', 'll_m1', 'll_m2'] as const;

export const UPPER_ARCH = [...UPPER_RIGHT_TEETH, ...UPPER_LEFT_TEETH];
export const LOWER_ARCH = [...LOWER_RIGHT_TEETH, ...LOWER_LEFT_TEETH];
export const ALL_TEETH = [...UPPER_ARCH, ...LOWER_ARCH];

export const POSTERIOR_TEETH_UR = ['ur_m2', 'ur_m1', 'ur_pm2', 'ur_pm1'];
export const POSTERIOR_TEETH_UL = ['ul_pm1', 'ul_pm2', 'ul_m1', 'ul_m2'];
export const POSTERIOR_TEETH_LR = ['lr_m2', 'lr_m1', 'lr_pm2', 'lr_pm1'];
export const POSTERIOR_TEETH_LL = ['ll_pm1', 'll_pm2', 'll_m1', 'll_m2'];

export const ANTERIOR_TEETH_UPPER = ['ur_c', 'ur_li', 'ur_ci', 'ul_ci', 'ul_li', 'ul_c'];
export const ANTERIOR_TEETH_LOWER = ['lr_c', 'lr_li', 'lr_ci', 'll_ci', 'll_li', 'll_c'];

export const ALL_POSTERIOR = [
  ...POSTERIOR_TEETH_UR,
  ...POSTERIOR_TEETH_UL,
  ...POSTERIOR_TEETH_LR,
  ...POSTERIOR_TEETH_LL
];
