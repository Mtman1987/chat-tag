'use client';
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  CollectionReference,
  DocumentReference,
  SetOptions,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import type { FirebaseApp } from 'firebase/app';

export function setDocumentNonBlocking(
  firebaseApp: FirebaseApp,
  docRef: DocumentReference,
  data: any,
  options?: SetOptions
) {
  const operation = options && 'merge' in options ? 'update' : 'create';
  setDoc(docRef, data, options ?? {}).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError(firebaseApp, {
      path: docRef.path,
      operation: operation,
      requestResourceData: data,
    });

    errorEmitter.emit('permission-error', permissionError);
  });
}

export function addDocumentNonBlocking(
  firebaseApp: FirebaseApp,
  colRef: CollectionReference,
  data: any
) {
  const promise = addDoc(colRef, data).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError(firebaseApp, {
      path: colRef.path,
      operation: 'create',
      requestResourceData: data,
    });
    errorEmitter.emit('permission-error', permissionError);
  });
  return promise;
}

export function updateDocumentNonBlocking(
  firebaseApp: FirebaseApp,
  docRef: DocumentReference,
  data: any
) {
  updateDoc(docRef, data).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError(firebaseApp, {
      path: docRef.path,
      operation: 'update',
      requestResourceData: data,
    });
    errorEmitter.emit('permission-error', permissionError);
  });
}

export function deleteDocumentNonBlocking(
  firebaseApp: FirebaseApp,
  docRef: DocumentReference
) {
  deleteDoc(docRef).catch(async (serverError) => {
    const permissionError = new FirestorePermissionError(firebaseApp, {
      path: docRef.path,
      operation: 'delete',
    });
    errorEmitter.emit('permission-error', permissionError);
  });
}
