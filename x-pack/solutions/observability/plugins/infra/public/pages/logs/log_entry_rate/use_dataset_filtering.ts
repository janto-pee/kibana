/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Filter } from '@kbn/es-query';
import { useEffect, useReducer, useCallback } from 'react';
import { CONTROLLED_BY_SWIM_LANE_FILTER } from '@kbn/ml-plugin/public';
import { useKibanaContextForPlugin } from '../../../hooks/use_kibana';

interface ReducerState {
  selectedDatasets: string[];
  selectedDatasetsFilters: Filter[];
}

type ReducerAction =
  | { type: 'changeSelectedDatasets'; payload: { datasets: string[] } }
  | { type: 'updateDatasetsFilters'; payload: { filters: Filter[] } };

const initialState: ReducerState = {
  selectedDatasets: [],
  selectedDatasetsFilters: [],
};

function reducer(state: ReducerState, action: ReducerAction) {
  switch (action.type) {
    case 'changeSelectedDatasets':
      return {
        ...state,
        selectedDatasets: action.payload.datasets,
      };
    case 'updateDatasetsFilters':
      const datasetsToAdd = action.payload.filters.reduce(
        (prevFilters: string[], nextFilter: Filter) => {
          const query =
            typeof nextFilter.meta.params === 'object' &&
            'query' in nextFilter.meta.params &&
            nextFilter.meta.params?.query;
          const queryString = query ? String(query) : '';
          if (!state.selectedDatasets.includes(queryString)) {
            prevFilters.push(queryString);
          }
          return prevFilters;
        },
        []
      );

      return {
        ...state,
        selectedDatasets: [...state.selectedDatasets, ...datasetsToAdd],
        selectedDatasetsFilters: action.payload.filters,
      };
    default:
      throw new Error('Unknown action');
  }
}

export const useDatasetFiltering = () => {
  const { services } = useKibanaContextForPlugin();
  const [reducerState, dispatch] = useReducer(reducer, initialState);

  const handleSetSelectedDatasets = useCallback(
    (datasets: string[]) => {
      dispatch({ type: 'changeSelectedDatasets', payload: { datasets } });
    },
    [dispatch]
  );

  // NOTE: The anomaly swimlane embeddable will communicate it's filter action
  // changes via the filterManager service.
  useEffect(() => {
    const sub = services.data.query.filterManager.getUpdates$().subscribe(() => {
      const filters = services.data.query.filterManager
        .getFilters()
        .filter(
          (filter) =>
            filter.meta.controlledBy && filter.meta.controlledBy === CONTROLLED_BY_SWIM_LANE_FILTER
        );
      dispatch({ type: 'updateDatasetsFilters', payload: { filters } });
    });

    return () => sub.unsubscribe();
  }, [services.data.query.filterManager, dispatch]);

  // NOTE: When filters are removed via the UI we need to make sure these are also tidied up
  // within the FilterManager service, otherwise a scenario can occur where that filter can't
  // be re-added via the embeddable as it will be seen as a duplicate to the FilterManager,
  // and no update will be emitted.
  useEffect(() => {
    const filtersToRemove = reducerState.selectedDatasetsFilters.filter((filter: Filter) => {
      const query =
        typeof filter.meta.params === 'object' &&
        'query' in filter.meta.params &&
        filter.meta.params?.query;
      const queryString = query ? String(query) : '';
      return !reducerState.selectedDatasets.includes(queryString);
    });
    if (filtersToRemove.length > 0) {
      filtersToRemove.forEach((filter: Filter) => {
        services.data.query.filterManager.removeFilter(filter);
      });
    }
  }, [
    reducerState.selectedDatasets,
    reducerState.selectedDatasetsFilters,
    services.data.query.filterManager,
  ]);

  return {
    selectedDatasets: reducerState.selectedDatasets,
    setSelectedDatasets: handleSetSelectedDatasets,
    selectedDatasetsFilters: reducerState.selectedDatasetsFilters,
  };
};
