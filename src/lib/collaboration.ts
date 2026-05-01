import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { generateUUID } from '@/utils/uuid';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  color: string;
  cursor?: { x: number; y: number };
  lastSeen: string;
}

export interface DocumentChange {
  type: 'update' | 'insert' | 'delete';
  path: string;
  value: any;
  timestamp: string;
  userId: string;
}

export interface CollaborationState {
  users: CollaborationUser[];
  isConnected: boolean;
  documentData: any;
}

const USER_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red  
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#8B5CF6', // Purple
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

/**
 * Initialize collaborative editing for a document
 */
export class CollaborativeEditor {
  private channel: RealtimeChannel | null = null;
  private documentId: string;
  private documentType: string;
  private currentUser: CollaborationUser | null = null;
  private onStateChange: (state: CollaborationState) => void;
  private state: CollaborationState = {
    users: [],
    isConnected: false,
    documentData: {}
  };

  constructor(
    documentId: string,
    documentType: string,
    onStateChange: (state: CollaborationState) => void
  ) {
    this.documentId = documentId;
    this.documentType = documentType;
    this.onStateChange = onStateChange;
  }

  async initialize(userData: { name: string; email: string }) {
    try {
      // Generate current user
      this.currentUser = {
        id: generateUUID(),
        name: userData.name,
        email: userData.email,
        color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
        lastSeen: new Date().toISOString()
      };

      // Create channel
      const channelName = `doc_${this.documentType}_${this.documentId}`;
      this.channel = supabase.channel(channelName);

      // Set up presence tracking
      this.channel
        .on('presence', { event: 'sync' }, () => {
          const presenceState = this.channel!.presenceState();
          const users: CollaborationUser[] = [];
          
          Object.values(presenceState).forEach(presences => {
            presences.forEach(presence => {
              if (typeof presence === 'object' && presence !== null) {
                users.push(presence as unknown as CollaborationUser);
              }
            });
          });

          this.state.users = users;
          this.state.isConnected = true;
          this.onStateChange(this.state);
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          console.log('User joined:', newPresences);
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          console.log('User left:', leftPresences);
        })
        .on('broadcast', { event: 'document_change' }, ({ payload }) => {
          if (payload.userId !== this.currentUser?.id) {
            this.handleRemoteChange(payload);
          }
        })
        .on('broadcast', { event: 'cursor_move' }, ({ payload }) => {
          if (payload.userId !== this.currentUser?.id) {
            this.updateUserCursor(payload.userId, payload.cursor);
          }
        });

      // Subscribe and track presence
      await this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && this.currentUser) {
          await this.channel!.track(this.currentUser);
        }
      });

      return this.currentUser;
    } catch (error) {
      console.error('Failed to initialize collaboration:', error);
      throw error;
    }
  }

  /**
   * Broadcast a document change to other users
   */
  broadcastChange(change: Omit<DocumentChange, 'userId' | 'timestamp'>) {
    if (!this.channel || !this.currentUser) return;

    const payload: DocumentChange = {
      ...change,
      userId: this.currentUser.id,
      timestamp: new Date().toISOString()
    };

    this.channel.send({
      type: 'broadcast',
      event: 'document_change',
      payload
    });

    // Update local state
    this.applyChange(payload);
  }

  /**
   * Broadcast cursor movement
   */
  broadcastCursor(x: number, y: number) {
    if (!this.channel || !this.currentUser) return;

    this.channel.send({
      type: 'broadcast',
      event: 'cursor_move',
      payload: {
        userId: this.currentUser.id,
        cursor: { x, y }
      }
    });
  }

  /**
   * Handle remote document changes
   */
  private handleRemoteChange(change: DocumentChange) {
    this.applyChange(change);
    this.onStateChange(this.state);
  }

  /**
   * Apply a change to the document state
   */
  private applyChange(change: DocumentChange) {
    // Simple last-write-wins approach
    // In a production system, you'd implement operational transforms
    const pathParts = change.path.split('.');
    let current = this.state.documentData;
    
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!current[part]) current[part] = {};
      current = current[part];
    }
    
    const lastPart = pathParts[pathParts.length - 1];
    
    switch (change.type) {
      case 'update':
        current[lastPart] = change.value;
        break;
      case 'delete':
        delete current[lastPart];
        break;
      case 'insert':
        if (Array.isArray(current[lastPart])) {
          current[lastPart].push(change.value);
        } else {
          current[lastPart] = change.value;
        }
        break;
    }
  }

  /**
   * Update user cursor position
   */
  private updateUserCursor(userId: string, cursor: { x: number; y: number }) {
    this.state.users = this.state.users.map(user =>
      user.id === userId ? { ...user, cursor } : user
    );
    this.onStateChange(this.state);
  }

  /**
   * Set document data
   */
  setDocumentData(data: any) {
    this.state.documentData = data;
    this.onStateChange(this.state);
  }

  /**
   * Get current document data
   */
  getDocumentData() {
    return this.state.documentData;
  }

  /**
   * Cleanup and disconnect
   */
  disconnect() {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    
    this.state.isConnected = false;
    this.state.users = [];
    this.onStateChange(this.state);
  }
}

/**
 * Hook for collaborative editing
 */
export function useCollaborativeEditor(
  documentId: string,
  documentType: string,
  initialData?: any
) {
  const [editor, setEditor] = React.useState<CollaborativeEditor | null>(null);
  const [state, setState] = React.useState<CollaborationState>({
    users: [],
    isConnected: false,
    documentData: initialData || {}
  });

  React.useEffect(() => {
    const collaborativeEditor = new CollaborativeEditor(
      documentId,
      documentType,
      setState
    );

    // Initialize with current user data
    collaborativeEditor.initialize({
      name: 'Current User', // This should come from auth context
      email: 'user@example.com' // This should come from auth context
    }).then(() => {
      if (initialData) {
        collaborativeEditor.setDocumentData(initialData);
      }
    });

    setEditor(collaborativeEditor);

    return () => {
      collaborativeEditor.disconnect();
    };
  }, [documentId, documentType]);

  const broadcastChange = React.useCallback((path: string, value: any, type: 'update' | 'insert' | 'delete' = 'update') => {
    editor?.broadcastChange({ type, path, value });
  }, [editor]);

  const broadcastCursor = React.useCallback((x: number, y: number) => {
    editor?.broadcastCursor(x, y);
  }, [editor]);

  return {
    ...state,
    broadcastChange,
    broadcastCursor,
    setDocumentData: (data: any) => editor?.setDocumentData(data)
  };
}