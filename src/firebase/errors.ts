'use client';
import { getAuth, type User } from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

interface FirebaseAuthToken {
  name: string | null;
  picture: string | null;
  email: string | null;
  email_verified: boolean;
  phone_number: string | null;
  sub: string;
  firebase: {
    identities: Record<string, any>;
    sign_in_provider: string;
    tenant: string | null;
  };
}

interface FirebaseAuthObject {
  uid: string;
  token: FirebaseAuthToken;
}

interface SecurityRuleRequest {
  auth: FirebaseAuthObject | null;
  method: string;
  path: string;
  resource?: {
    data: any;
  };
}

function buildAuthObject(currentUser: User | null): FirebaseAuthObject | null {
  if (!currentUser) {
    return null;
  }
  const decodedToken: Partial<FirebaseAuthToken> = {};
  if (currentUser.displayName) decodedToken.name = currentUser.displayName;
  if (currentUser.photoURL) decodedToken.picture = currentUser.photoURL;
  if (currentUser.email) decodedToken.email = currentUser.email;
  decodedToken.email_verified = currentUser.emailVerified;
  if (currentUser.phoneNumber)
    decodedToken.phone_number = currentUser.phoneNumber;

  const token: FirebaseAuthToken = {
    name: currentUser.displayName,
    picture: currentUser.photoURL,
    email: currentUser.email,
    email_verified: currentUser.emailVerified,
    phone_number: currentUser.phoneNumber,
    sub: currentUser.uid,
    firebase: {
      identities: currentUser.providerData.reduce(
        (acc, p) => {
          if (p.providerId) {
            acc[p.providerId] = [p.uid];
          }
          return acc;
        },
        {} as Record<string, string[]>
      ),
      sign_in_provider: currentUser.providerData[0]?.providerId || 'custom',
      tenant: currentUser.tenantId,
    },
  };

  return {
    uid: currentUser.uid,
    token: token,
  };
}

function buildRequestObject(
  firebaseApp: FirebaseApp,
  context: SecurityRuleContext
): SecurityRuleRequest {
  const auth = getAuth(firebaseApp);
  return {
    auth: buildAuthObject(auth.currentUser),
    method: context.operation,
    path: `/databases/(default)/documents/${context.path}`,
    resource: context.requestResourceData
      ? { data: context.requestResourceData }
      : undefined,
  };
}

function buildErrorMessage(requestObject: SecurityRuleRequest): string {
  return `Missing or insufficient permissions: The following request was denied by Firestore Security Rules:
${JSON.stringify(requestObject, null, 2)}`;
}

export class FirestorePermissionError extends Error {
  public readonly request: SecurityRuleRequest;

  constructor(firebaseApp: FirebaseApp, context: SecurityRuleContext) {
    const requestObject = buildRequestObject(firebaseApp, context);
    super(buildErrorMessage(requestObject));
    this.name = 'FirebaseError';
    this.request = requestObject;
  }
}
