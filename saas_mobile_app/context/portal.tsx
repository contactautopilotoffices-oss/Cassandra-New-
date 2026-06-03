import { createContext } from 'react';

export interface PortalType {
  name: string;
  node: React.ReactNode;
}

export type ActionTypes =
  | { type: 'ADD_UPDATE_PORTAL'; hostName: string; portalName: string; node: React.ReactNode }
  | { type: 'REMOVE_PORTAL'; hostName: string; portalName: string }
  | { type: 'REGISTER_HOST'; hostName: string }
  | { type: 'UNREGISTER_HOST'; hostName: string };

export const PortalStateContext = createContext<Record<string, Array<PortalType>> | null>(null);
export const PortalDispatchContext = createContext<React.Dispatch<ActionTypes> | null>(null);
