'use client';
import { useState, useEffect, DependencyList } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { useFirebaseApp, useMemoFirebase } from '@/firebase/provider';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { FirebaseApp } from 'firebase/app';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    };
  };
}

export function useCollection<T = any>(
  query: Query<DocumentData> | CollectionReference<DocumentData> | null | undefined
): UseCollectionResult<T> {
  const firebaseApp = useFirebaseApp();
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;
  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!query || !firebaseApp) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      query,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        snapshot.forEach((doc) => {
          results.push({ ...(doc.data() as T), id: doc.id });
        });
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        const path: string =
          query.type === 'collection'
            ? (query as CollectionReference).path
            : (query as InternalQuery)._query.path.canonicalString();

        const contextualError = new FirestorePermissionError(firebaseApp, {
          operation: 'list',
          path,
        });

        setError(contextualError);
        setData(null);
        setIsLoading(false);

        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [query, firebaseApp]);

  return { data, isLoading, error };
}
