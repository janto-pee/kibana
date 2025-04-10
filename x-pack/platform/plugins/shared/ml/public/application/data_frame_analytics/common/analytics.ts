/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import type { Subscription } from 'rxjs';
import { BehaviorSubject } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs';
import { cloneDeep } from 'lodash';
import { extractErrorMessage } from '@kbn/ml-error-utils';
import {
  type ClassificationEvaluateResponse,
  type DataFrameAnalysisConfigType,
  type EvaluateMetrics,
  type TrackTotalHitsSearchResponse,
  ANALYSIS_CONFIG_TYPE,
} from '@kbn/ml-data-frame-analytics-utils';
import type { estypes } from '@elastic/elasticsearch';
import type { Dictionary } from '../../../../common/types/common';
import type { MlApi } from '../../services/ml_api_service';

export type IndexPattern = string;

export interface LoadExploreDataArg {
  filterByIsTraining?: boolean;
  searchQuery: estypes.QueryDslQueryContainer;
}

export interface ClassificationMetricItem {
  className: string;
  accuracy?: number;
  recall?: number;
}

export const SEARCH_SIZE = 1000;

export const defaultSearchQuery = {
  match_all: {},
};

export const getDefaultTrainingFilterQuery = (resultsField: string, isTraining: boolean) => ({
  bool: {
    minimum_should_match: 1,
    should: [
      {
        match: { [`${resultsField}.is_training`]: isTraining },
      },
    ],
  },
});

export interface SearchQuery {
  track_total_hits?: boolean;
  query: estypes.QueryDslQueryContainer;
  sort?: any;
}

export interface Eval {
  mse: number | string;
  msle: number | string;
  huber: number | string;
  rSquared: number | string;
  error: null | string;
}

export interface RegressionEvaluateResponse {
  regression: {
    huber: {
      value: number;
    };
    mse: {
      value: number;
    };
    msle: {
      value: number;
    };
    r_squared: {
      value: number;
    };
  };
}

interface LoadEvaluateResult {
  success: boolean;
  eval: RegressionEvaluateResponse | ClassificationEvaluateResponse | null;
  error: string | null;
}

export const isResultsSearchBoolQuery = (arg: any): arg is ResultsSearchBoolQuery => {
  if (arg === undefined) return false;
  const keys = Object.keys(arg);
  return keys.length === 1 && keys[0] === 'bool';
};

export const isQueryStringQuery = (arg: any): arg is QueryStringQuery => {
  if (arg === undefined) return false;
  const keys = Object.keys(arg);
  return keys.length === 1 && keys[0] === 'query_string';
};

export const isRegressionEvaluateResponse = (arg: any): arg is RegressionEvaluateResponse => {
  const keys = Object.keys(arg);
  return (
    keys.length === 1 &&
    keys[0] === ANALYSIS_CONFIG_TYPE.REGRESSION &&
    arg?.regression?.mse !== undefined &&
    arg?.regression?.r_squared !== undefined
  );
};

export const isClassificationEvaluateResponse = (
  arg: any
): arg is ClassificationEvaluateResponse => {
  const keys = Object.keys(arg);
  return (
    keys.length === 1 &&
    keys[0] === ANALYSIS_CONFIG_TYPE.CLASSIFICATION &&
    (arg?.classification?.multiclass_confusion_matrix !== undefined ||
      arg?.classification?.auc_roc !== undefined)
  );
};

export enum REFRESH_ANALYTICS_LIST_STATE {
  ERROR = 'error',
  IDLE = 'idle',
  LOADING = 'loading',
  REFRESH = 'refresh',
}
export const refreshAnalyticsList$ = new BehaviorSubject<REFRESH_ANALYTICS_LIST_STATE>(
  REFRESH_ANALYTICS_LIST_STATE.IDLE
);

export const useRefreshAnalyticsList = (
  callback: {
    isLoading?(d: boolean): void;
    onRefresh?(): void;
  } = {}
) => {
  useEffect(() => {
    const distinct$ = refreshAnalyticsList$.pipe(distinctUntilChanged());

    const subscriptions: Subscription[] = [];

    if (typeof callback.onRefresh === 'function') {
      subscriptions.push(
        distinct$
          .pipe(filter((state) => state === REFRESH_ANALYTICS_LIST_STATE.REFRESH))
          .subscribe(() => {
            if (typeof callback.onRefresh === 'function') {
              callback.onRefresh();
            }
          })
      );
    }

    if (typeof callback.isLoading === 'function') {
      subscriptions.push(
        distinct$.subscribe(
          (state) =>
            typeof callback.isLoading === 'function' &&
            callback.isLoading(state === REFRESH_ANALYTICS_LIST_STATE.LOADING)
        )
      );
    }

    return () => {
      subscriptions.map((sub) => sub.unsubscribe());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback.onRefresh]);

  return {
    refresh: () => {
      // A refresh is followed immediately by setting the state to loading
      // to trigger data fetching and loading indicators in one go.
      refreshAnalyticsList$.next(REFRESH_ANALYTICS_LIST_STATE.REFRESH);
      refreshAnalyticsList$.next(REFRESH_ANALYTICS_LIST_STATE.LOADING);
    },
  };
};

const DEFAULT_SIG_FIGS = 3;

interface RegressionEvaluateExtractedResponse {
  mse: number | string;
  msle: number | string;
  huber: number | string;
  r_squared: number | string;
}

export const EMPTY_STAT = '--';

export function getValuesFromResponse(response: RegressionEvaluateResponse) {
  const results: RegressionEvaluateExtractedResponse = {
    mse: EMPTY_STAT,
    msle: EMPTY_STAT,
    huber: EMPTY_STAT,
    r_squared: EMPTY_STAT,
  };

  if (response?.regression) {
    for (const statType in response.regression) {
      if (Object.hasOwn(response.regression, statType)) {
        let currentStatValue =
          response.regression[statType as keyof RegressionEvaluateResponse['regression']]?.value;
        if (currentStatValue && Number.isFinite(currentStatValue)) {
          currentStatValue = Number(currentStatValue.toPrecision(DEFAULT_SIG_FIGS));
        }
        results[statType as keyof RegressionEvaluateExtractedResponse] = currentStatValue;
      }
    }
  }

  return results;
}
interface ResultsSearchBoolQuery {
  bool: Dictionary<any>;
}
interface ResultsSearchTermQuery {
  term: Dictionary<any>;
}

interface QueryStringQuery {
  query_string: Dictionary<any>;
}

export type ResultsSearchQuery =
  | ResultsSearchBoolQuery
  | ResultsSearchTermQuery
  | estypes.QueryDslQueryContainer;

export function getEvalQueryBody({
  resultsField,
  isTraining,
  searchQuery,
  ignoreDefaultQuery,
}: {
  resultsField: string;
  isTraining?: boolean;
  searchQuery?: ResultsSearchQuery;
  ignoreDefaultQuery?: boolean;
}) {
  let query: any;

  const trainingQuery: ResultsSearchQuery = {
    term: { [`${resultsField}.is_training`]: { value: isTraining } },
  };

  const searchQueryClone = cloneDeep(searchQuery);

  if (isResultsSearchBoolQuery(searchQueryClone)) {
    if (searchQueryClone.bool.must === undefined) {
      searchQueryClone.bool.must = [];
    }

    if (isTraining !== undefined) {
      searchQueryClone.bool.must.push(trainingQuery);
    }

    query = searchQueryClone;
  } else if (isQueryStringQuery(searchQueryClone)) {
    query = {
      bool: {
        must: [searchQueryClone],
      },
    };
    if (isTraining !== undefined) {
      query.bool.must.push(trainingQuery);
    }
  } else {
    // Not a bool or string query so we need to create it so can add the trainingQuery
    query = {
      bool: {
        must: isTraining !== undefined ? [trainingQuery] : [],
      },
    };
  }
  return query;
}

export enum REGRESSION_STATS {
  MSE = 'mse',
  MSLE = 'msle',
  R_SQUARED = 'rSquared',
  HUBER = 'huber',
}

interface LoadEvalDataConfig {
  mlApi: MlApi;
  isTraining?: boolean;
  index: string;
  dependentVariable: string;
  resultsField: string;
  predictionFieldName?: string;
  searchQuery?: ResultsSearchQuery;
  ignoreDefaultQuery?: boolean;
  jobType: DataFrameAnalysisConfigType;
  requiresKeyword?: boolean;
  rocCurveClassName?: string;
  includeMulticlassConfusionMatrix?: boolean;
}

export const loadEvalData = async ({
  mlApi,
  isTraining,
  index,
  dependentVariable,
  resultsField,
  predictionFieldName,
  searchQuery,
  ignoreDefaultQuery,
  jobType,
  requiresKeyword,
  rocCurveClassName,
  includeMulticlassConfusionMatrix = true,
}: LoadEvalDataConfig) => {
  const results: LoadEvaluateResult = { success: false, eval: null, error: null };
  const defaultPredictionField = `${dependentVariable}_prediction`;
  let predictedField = `${resultsField}.${
    predictionFieldName ? predictionFieldName : defaultPredictionField
  }`;

  if (jobType === ANALYSIS_CONFIG_TYPE.CLASSIFICATION && requiresKeyword === true) {
    predictedField = `${predictedField}.keyword`;
  }

  const query = getEvalQueryBody({ resultsField, isTraining, searchQuery, ignoreDefaultQuery });

  const metrics: EvaluateMetrics = {
    classification: {
      accuracy: {},
      recall: {},
      ...(includeMulticlassConfusionMatrix ? { multiclass_confusion_matrix: {} } : {}),
      ...(rocCurveClassName !== undefined
        ? { auc_roc: { include_curve: true, class_name: rocCurveClassName } }
        : {}),
    },
    regression: {
      r_squared: {},
      mse: {},
      msle: {},
      huber: {},
    },
  };

  const config = {
    index,
    query,
    evaluation: {
      [jobType]: {
        actual_field: dependentVariable,
        predicted_field: predictedField,
        ...(jobType === ANALYSIS_CONFIG_TYPE.CLASSIFICATION
          ? { top_classes_field: `${resultsField}.top_classes` }
          : {}),
        metrics: metrics[jobType as keyof EvaluateMetrics],
      },
    },
  };

  try {
    const evalResult = await mlApi.dataFrameAnalytics.evaluateDataFrameAnalytics(config);
    results.success = true;
    results.eval = evalResult;
    return results;
  } catch (e) {
    results.error = extractErrorMessage(e);
    return results;
  }
};

interface LoadDocsCountConfig {
  mlApi: MlApi;
  ignoreDefaultQuery?: boolean;
  isTraining?: boolean;
  searchQuery: estypes.QueryDslQueryContainer;
  resultsField: string;
  destIndex: string;
}

interface LoadDocsCountResponse {
  docsCount: number | null;
  success: boolean;
}

export const loadDocsCount = async ({
  mlApi,
  ignoreDefaultQuery = true,
  isTraining,
  searchQuery,
  resultsField,
  destIndex,
}: LoadDocsCountConfig): Promise<LoadDocsCountResponse> => {
  const query = getEvalQueryBody({ resultsField, isTraining, ignoreDefaultQuery, searchQuery });

  try {
    const body: SearchQuery = {
      track_total_hits: true,
      query,
    };

    const resp: TrackTotalHitsSearchResponse = await mlApi.esSearch({
      index: destIndex,
      size: 0,
      body,
    });

    const docsCount = resp.hits.total && resp.hits.total.value;
    return { docsCount, success: docsCount !== undefined };
  } catch (e) {
    return {
      docsCount: null,
      success: false,
    };
  }
};
