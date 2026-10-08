import { 
  Surface,
  UPPER_RIGHT_TEETH, UPPER_LEFT_TEETH, LOWER_RIGHT_TEETH, LOWER_LEFT_TEETH,
  POSTERIOR_TEETH_UR, POSTERIOR_TEETH_UL, POSTERIOR_TEETH_LR, POSTERIOR_TEETH_LL,
  ANTERIOR_TEETH_UPPER, ANTERIOR_TEETH_LOWER
} from './anatomy';

export interface ZoneDefinition {
  id: string;
  toothIds: string[];
  surfaces: Surface[];
  order: number;
  type: "primary" | "chewing";
}

export const ZONES_12: ZoneDefinition[] = [
  { id: 'upper_right_outer', toothIds: POSTERIOR_TEETH_UR, surfaces: ['outer'], order: 1, type: 'primary' },
  { id: 'upper_front_outer', toothIds: ANTERIOR_TEETH_UPPER, surfaces: ['outer'], order: 2, type: 'primary' },
  { id: 'upper_left_outer', toothIds: POSTERIOR_TEETH_UL, surfaces: ['outer'], order: 3, type: 'primary' },
  
  { id: 'lower_right_outer', toothIds: POSTERIOR_TEETH_LR, surfaces: ['outer'], order: 4, type: 'primary' },
  { id: 'lower_front_outer', toothIds: ANTERIOR_TEETH_LOWER, surfaces: ['outer'], order: 5, type: 'primary' },
  { id: 'lower_left_outer', toothIds: POSTERIOR_TEETH_LL, surfaces: ['outer'], order: 6, type: 'primary' },
  
  { id: 'upper_right_inner', toothIds: POSTERIOR_TEETH_UR, surfaces: ['inner'], order: 7, type: 'primary' },
  { id: 'upper_front_inner', toothIds: ANTERIOR_TEETH_UPPER, surfaces: ['inner'], order: 8, type: 'primary' },
  { id: 'upper_left_inner', toothIds: POSTERIOR_TEETH_UL, surfaces: ['inner'], order: 9, type: 'primary' },
  
  { id: 'lower_right_inner', toothIds: POSTERIOR_TEETH_LR, surfaces: ['inner'], order: 10, type: 'primary' },
  { id: 'lower_front_inner', toothIds: ANTERIOR_TEETH_LOWER, surfaces: ['inner'], order: 11, type: 'primary' },
  { id: 'lower_left_inner', toothIds: POSTERIOR_TEETH_LL, surfaces: ['inner'], order: 12, type: 'primary' },
];

export const ZONES_8: ZoneDefinition[] = [
  { id: 'q_upper_right_outer', toothIds: [...UPPER_RIGHT_TEETH], surfaces: ['outer'], order: 1, type: 'primary' },
  { id: 'q_upper_left_outer', toothIds: [...UPPER_LEFT_TEETH], surfaces: ['outer'], order: 2, type: 'primary' },
  { id: 'q_lower_right_outer', toothIds: [...LOWER_RIGHT_TEETH], surfaces: ['outer'], order: 3, type: 'primary' },
  { id: 'q_lower_left_outer', toothIds: [...LOWER_LEFT_TEETH], surfaces: ['outer'], order: 4, type: 'primary' },
  
  { id: 'q_upper_right_inner', toothIds: [...UPPER_RIGHT_TEETH], surfaces: ['inner'], order: 5, type: 'primary' },
  { id: 'q_upper_left_inner', toothIds: [...UPPER_LEFT_TEETH], surfaces: ['inner'], order: 6, type: 'primary' },
  { id: 'q_lower_right_inner', toothIds: [...LOWER_RIGHT_TEETH], surfaces: ['inner'], order: 7, type: 'primary' },
  { id: 'q_lower_left_inner', toothIds: [...LOWER_LEFT_TEETH], surfaces: ['inner'], order: 8, type: 'primary' },
];

export const CHEWING_ZONES: ZoneDefinition[] = [
  { id: 'upper_right_chewing', toothIds: POSTERIOR_TEETH_UR, surfaces: ['chewing'], order: 1, type: 'chewing' },
  { id: 'upper_left_chewing', toothIds: POSTERIOR_TEETH_UL, surfaces: ['chewing'], order: 2, type: 'chewing' },
  { id: 'lower_left_chewing', toothIds: POSTERIOR_TEETH_LL, surfaces: ['chewing'], order: 3, type: 'chewing' },
  { id: 'lower_right_chewing', toothIds: POSTERIOR_TEETH_LR, surfaces: ['chewing'], order: 4, type: 'chewing' },
];
