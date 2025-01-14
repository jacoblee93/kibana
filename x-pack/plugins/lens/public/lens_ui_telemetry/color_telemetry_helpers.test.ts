/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getColorMappingTelemetryEvents } from './color_telemetry_helpers';
import {
  ColorMapping,
  EUIAmsterdamColorBlindPalette,
  ElasticBrandPalette,
  NeutralPalette,
} from '@kbn/coloring';
import faker from 'faker';
import { DEFAULT_NEUTRAL_PALETTE_INDEX } from '@kbn/coloring/src/shared_components/color_mapping/config/default_color_mapping';

export const DEFAULT_COLOR_MAPPING_CONFIG: ColorMapping.Config = {
  assignmentMode: 'auto',
  assignments: [],
  specialAssignments: [
    {
      rule: {
        type: 'other',
      },
      color: {
        type: 'categorical',
        paletteId: NeutralPalette.id,
        colorIndex: DEFAULT_NEUTRAL_PALETTE_INDEX,
      },
      touched: false,
    },
  ],
  paletteId: EUIAmsterdamColorBlindPalette.id,
  colorMode: {
    type: 'categorical',
  },
};

const exampleAssignment = (valuesCount = 1, type = 'categorical', overrides = {}) => {
  const color =
    type === 'categorical'
      ? {
          type: 'categorical',
          paletteId: ElasticBrandPalette.id,
          colorIndex: 0,
        }
      : {
          type: 'colorCode',
          colorCode: faker.internet.color(),
        };

  return {
    rule: {
      type: 'matchExactly',
      values: Array.from({ length: valuesCount }, () => faker.random.alpha()),
    },
    color,
    touched: false,
    ...overrides,
  } as ColorMapping.Config['assignments'][0];
};

const MANUAL_COLOR_MAPPING_CONFIG: ColorMapping.Config = {
  assignmentMode: 'manual',
  assignments: [
    exampleAssignment(4),
    exampleAssignment(),
    exampleAssignment(4, 'custom'),
    exampleAssignment(1, 'custom'),
  ],
  specialAssignments: [
    {
      rule: {
        type: 'other',
      },
      color: {
        type: 'categorical',
        paletteId: ElasticBrandPalette.id,
        colorIndex: 2,
      },
      touched: true,
    },
  ],
  paletteId: ElasticBrandPalette.id,
  colorMode: {
    type: 'categorical',
  },
};

const specialAssignmentsPalette: ColorMapping.Config['specialAssignments'] = [
  {
    ...DEFAULT_COLOR_MAPPING_CONFIG.specialAssignments[0],
    color: {
      type: 'categorical',
      paletteId: EUIAmsterdamColorBlindPalette.id,
      colorIndex: 0,
    },
  },
];
const specialAssignmentsCustom1: ColorMapping.Config['specialAssignments'] = [
  {
    ...DEFAULT_COLOR_MAPPING_CONFIG.specialAssignments[0],
    color: {
      type: 'colorCode',
      colorCode: '#501a0e',
    },
  },
];
const specialAssignmentsCustom2: ColorMapping.Config['specialAssignments'] = [
  {
    ...DEFAULT_COLOR_MAPPING_CONFIG.specialAssignments[0],
    color: {
      type: 'colorCode',
      colorCode: 'red',
    },
  },
];

describe('color_telemetry_helpers', () => {
  it('no events if color mapping is not defined', () => {
    expect(getColorMappingTelemetryEvents(undefined)).toEqual([]);
  });
  it('no events if no changes made in color mapping', () => {
    expect(
      getColorMappingTelemetryEvents(DEFAULT_COLOR_MAPPING_CONFIG, DEFAULT_COLOR_MAPPING_CONFIG)
    ).toEqual([]);
    expect(
      getColorMappingTelemetryEvents(MANUAL_COLOR_MAPPING_CONFIG, MANUAL_COLOR_MAPPING_CONFIG)
    ).toEqual([]);
  });
  it('settings (default): auto color mapping, unassigned terms neutral, default palette returns correct events', () => {
    expect(getColorMappingTelemetryEvents(DEFAULT_COLOR_MAPPING_CONFIG)).toEqual([
      'lens_color_mapping_auto',
      'lens_color_mapping_palette_eui_amsterdam_color_blind',
      'lens_color_mapping_unassigned_terms_neutral',
    ]);
  });
  it('gradient event when user changed colorMode to gradient', () => {
    expect(
      getColorMappingTelemetryEvents(
        {
          ...DEFAULT_COLOR_MAPPING_CONFIG,
          colorMode: {
            type: 'gradient',
            steps: [
              {
                type: 'categorical',
                paletteId: EUIAmsterdamColorBlindPalette.id,
                colorIndex: 0,
                touched: false,
              },
            ],
            sort: 'desc',
          },
        },
        DEFAULT_COLOR_MAPPING_CONFIG
      )
    ).toEqual(['lens_color_mapping_gradient']);
  });
  it('settings: manual mode, custom palette, unassigned terms from palette, 2 colors with 5 terms in total', () => {
    expect(getColorMappingTelemetryEvents(MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
      'lens_color_mapping_manual',
      'lens_color_mapping_palette_elastic_brand_2023',
      'lens_color_mapping_unassigned_terms_palette',
      'lens_color_mapping_colors_2_to_4',
      'lens_color_mapping_custom_colors_2',
      'lens_color_mapping_avg_count_terms_per_color_2_to_4',
    ]);
    expect(
      getColorMappingTelemetryEvents(MANUAL_COLOR_MAPPING_CONFIG, DEFAULT_COLOR_MAPPING_CONFIG)
    ).toEqual([
      'lens_color_mapping_manual',
      'lens_color_mapping_palette_elastic_brand_2023',
      'lens_color_mapping_unassigned_terms_palette',
      'lens_color_mapping_colors_2_to_4',
      'lens_color_mapping_custom_colors_2',
      'lens_color_mapping_avg_count_terms_per_color_2_to_4',
    ]);
  });
  it('color, custom color and count of terms changed (even if the same event would be returned)', () => {
    const config = { ...MANUAL_COLOR_MAPPING_CONFIG };
    config.assignments = config.assignments.slice(0, 3);
    expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
      'lens_color_mapping_colors_2_to_4',
      'lens_color_mapping_custom_colors_1',
      'lens_color_mapping_avg_count_terms_per_color_2_to_4',
    ]);
  });

  describe('color ranges', () => {
    it('0 colors', () => {
      const config = { ...MANUAL_COLOR_MAPPING_CONFIG };
      config.assignments = [];
      expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([]);
    });
    it('1 color', () => {
      const config = { ...MANUAL_COLOR_MAPPING_CONFIG };

      config.assignments = [exampleAssignment(4, 'custom')];
      expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
        'lens_color_mapping_colors_up_to_2',
        'lens_color_mapping_custom_colors_1',
        'lens_color_mapping_avg_count_terms_per_color_2_to_4',
      ]);
    });
    it('2 colors', () => {
      const config = { ...MANUAL_COLOR_MAPPING_CONFIG };

      config.assignments = [exampleAssignment(1), exampleAssignment(1)];
      expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
        'lens_color_mapping_colors_2',
        'lens_color_mapping_avg_count_terms_per_color_1',
      ]);
    });
    it('3 colors, 10 terms per assignment', () => {
      const config = { ...MANUAL_COLOR_MAPPING_CONFIG };

      config.assignments = Array.from({ length: 3 }, () => exampleAssignment(10));
      expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
        'lens_color_mapping_colors_2_to_4',
        'lens_color_mapping_avg_count_terms_per_color_above_4',
      ]);
    });
    it('7 colors, 2 terms per assignment, all custom', () => {
      const config = { ...MANUAL_COLOR_MAPPING_CONFIG };

      config.assignments = Array.from({ length: 7 }, () => exampleAssignment(2, 'custom'));
      expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
        'lens_color_mapping_colors_4_to_8',
        'lens_color_mapping_custom_colors_4_to_8',
        'lens_color_mapping_avg_count_terms_per_color_2',
      ]);
    });
    it('12 colors', () => {
      const config = { ...MANUAL_COLOR_MAPPING_CONFIG };

      config.assignments = Array.from({ length: 12 }, () => exampleAssignment(3, 'custom'));
      expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
        'lens_color_mapping_colors_8_to_16',
        'lens_color_mapping_custom_colors_8_to_16',
        'lens_color_mapping_avg_count_terms_per_color_2_to_4',
      ]);
    });
    it('27 colors', () => {
      const config = { ...MANUAL_COLOR_MAPPING_CONFIG };
      config.assignments = Array.from({ length: 27 }, () => exampleAssignment(3, 'custom'));
      expect(getColorMappingTelemetryEvents(config, MANUAL_COLOR_MAPPING_CONFIG)).toEqual([
        'lens_color_mapping_colors_above_16',
        'lens_color_mapping_custom_colors_above_16',
        'lens_color_mapping_avg_count_terms_per_color_2_to_4',
      ]);
    });
  });

  describe('unassigned terms', () => {
    it('unassigned terms changed from neutral to palette', () => {
      expect(
        getColorMappingTelemetryEvents(
          {
            ...DEFAULT_COLOR_MAPPING_CONFIG,
            specialAssignments: specialAssignmentsPalette,
          },
          DEFAULT_COLOR_MAPPING_CONFIG
        )
      ).toEqual(['lens_color_mapping_unassigned_terms_palette']);
    });
    it('unassigned terms changed from palette to neutral', () => {
      expect(
        getColorMappingTelemetryEvents(DEFAULT_COLOR_MAPPING_CONFIG, {
          ...DEFAULT_COLOR_MAPPING_CONFIG,
          specialAssignments: specialAssignmentsPalette,
        })
      ).toEqual(['lens_color_mapping_unassigned_terms_neutral']);
    });
    it('unassigned terms changed from neutral to another custom color', () => {
      expect(
        getColorMappingTelemetryEvents(
          {
            ...DEFAULT_COLOR_MAPPING_CONFIG,
            specialAssignments: specialAssignmentsCustom1,
          },
          DEFAULT_COLOR_MAPPING_CONFIG
        )
      ).toEqual(['lens_color_mapping_unassigned_terms_custom']);
    });
    it('unassigned terms changed from custom color to another custom color', () => {
      expect(
        getColorMappingTelemetryEvents(
          { ...DEFAULT_COLOR_MAPPING_CONFIG, specialAssignments: specialAssignmentsCustom1 },
          {
            ...DEFAULT_COLOR_MAPPING_CONFIG,
            specialAssignments: specialAssignmentsCustom2,
          }
        )
      ).toEqual(['lens_color_mapping_unassigned_terms_custom']);
    });
  });
});
