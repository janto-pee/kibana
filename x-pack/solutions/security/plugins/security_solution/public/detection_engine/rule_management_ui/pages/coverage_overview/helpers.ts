/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSelectableOption } from '@elastic/eui';
import type {
  CoverageOverviewRuleActivity,
  CoverageOverviewRuleSource,
} from '../../../../../common/api/detection_engine';

export const extractSelected = <
  T extends CoverageOverviewRuleSource | CoverageOverviewRuleActivity
>(
  options: EuiSelectableOption[]
): T[] => {
  return options.filter((option) => option.checked === 'on').map((option) => option.label as T);
};

export const populateSelected = <
  T extends CoverageOverviewRuleSource | CoverageOverviewRuleActivity
>(
  allOptions: Array<EuiSelectableOption<{ label: T }>>,
  selected: string[]
): Array<EuiSelectableOption<{ label: T }>> =>
  allOptions.map((option) =>
    selected.includes(option.label) ? { ...option, checked: 'on' } : option
  );
