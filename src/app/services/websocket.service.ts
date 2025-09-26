import { Injectable } from '@angular/core';
import { Client, IMessage, Stomp, StompConfig } from '@stomp/stompjs';
import { BehaviorSubject, Subject } from 'rxjs';
import { MessageDeletedEvent, MessageDto, NotificationDto, PresenceMessage, TypingMessage } from '../models/api.model';
import SockJS from 'sockjs-client';

import { AuthService } from './auth.service';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private stompClient: Client | null = null;
  private connectionStatus = new BehaviorSubject<boolean>(false);
  private messagesSubject = new Subject<MessageDto>();
  private messageDeletedSubject = new Subject<MessageDeletedEvent>();
  private typingSubject = new Subject<TypingMessage>();
  private notificationsSubject = new Subject<NotificationDto>();
  private presenceSubject = new Subject<PresenceMessage>();

  public connected$ = this.connectionStatus.asObservable();
  public messages$ = this.messagesSubject.asObservable();
  public messageDeleted$ = this.messageDeletedSubject.asObservable();
  public typing$ = this.typingSubject.asObservable();
  public notifications$ = this.notificationsSubject.asObservable();
  public presence$ = this.presenceSubject.asObservable();

  constructor(private authService: AuthService) {}

  async connect(): Promise<void> {
    if (this.stompClient?.connected) {
      return;
    }

    try {
      const token = await this.authService.getToken();
      console.log('Connecting WebSocket with token length:', token?.length);

      const stompConfig: StompConfig = {
        webSocketFactory: () => new SockJS(`${environment.wsUrl}`),
        connectHeaders: {
          Authorization: `Bearer ${token}`
        },
        debug: (str) => console.log('STOMP Debug:', str),
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        onConnect: (frame) => {
          console.log('WebSocket connected, frame:', frame);
          console.log('Connection headers:', frame.headers);
          this.connectionStatus.next(true);
          this.subscribeToTopics();
        },
        onDisconnect: (frame) => {
          console.log('WebSocket disconnected, frame:', frame);
          this.connectionStatus.next(false);
        },
        onStompError: (frame) => {
          console.error('STOMP error:', frame);
          this.connectionStatus.next(false);
        }
      }

      this.stompClient = new Client(stompConfig);
      this.stompClient.activate();

    } catch (error) {
      console.error('WebSocket connection failed:', error);
    }
  }

  disconnect(): void {
    if (this.stompClient) {
      this.stompClient.deactivate();
      this.connectionStatus.next(false);
    }
  }

  private subscribeToTopics(): void {
    if (!this.stompClient?.connected)
      return;

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      console.error('Current user not found, cannot subscribe to topics');
      return;
    }

    this.stompClient.subscribe(`/topic/user/${currentUser.id}/message`, (message: IMessage) => {
      console.log('Private message received:', message);
      const messageDto: MessageDto = JSON.parse(message.body);
      this.messagesSubject.next(messageDto);
    });

    this.stompClient.subscribe('/queue/private/deletions', (message: IMessage) => {
      console.log('Private deletion received:', message);
      const deletedEvent: MessageDeletedEvent = JSON.parse(message.body);
      this.messageDeletedSubject.next(deletedEvent);
    });

    this.stompClient.subscribe(`/topic/notifications/user/${currentUser.id}`, (message: IMessage) => {
      console.log('Notification received:', message);
      const notification: NotificationDto = JSON.parse(message.body);
      this.notificationsSubject.next(notification);
    });

  
    this.stompClient.subscribe(`/topic/user/${currentUser.id}/presence`, (message: IMessage) => {
      try {
        const presence: PresenceMessage = JSON.parse(message.body);
        this.presenceSubject.next(presence);
      } catch (error) {
        console.error('Error parsing presence message:', error);
      }
    });  
  }

  subscribeToChannelMessages(channelId: string): void {
    if (!this.stompClient?.connected) return;

    console.log('Subscribing to channel messages for channel:', channelId);

    this.stompClient.subscribe(`/topic/channel/${channelId}/messages`, (message: IMessage) => {
      const messageDto: MessageDto = JSON.parse(message.body);
      this.messagesSubject.next(messageDto);
    });

    this.stompClient.subscribe(`/topic/channel/${channelId}/deletions`, (message: IMessage) => {
      const deletedEvent: MessageDeletedEvent = JSON.parse(message.body);
      this.messageDeletedSubject.next(deletedEvent);
    });

    this.stompClient.subscribe(`/topic/channel/${channelId}/typing`, (message: IMessage) => {
      const typing: TypingMessage = JSON.parse(message.body);
      this.typingSubject.next(typing);
    });
  }

  subscribeToServerPresence(serverId: string): void {
    if (!this.stompClient?.connected) return;

    console.log('Subscribing to server presence for server:', serverId);

    this.stompClient.subscribe(`/topic/server/${serverId}/presence`, (message: IMessage) => {
      console.log('Server presence received:', message);
      const presence: PresenceMessage = JSON.parse(message.body);
      this.presenceSubject.next(presence);
    });
  }

  sendTypingIndicator(channelId: string, isTyping: boolean): void {
    if (!this.stompClient?.connected) return;

    this.stompClient.publish({
      destination: '/app/typing',
      body: JSON.stringify({
        channelId,
        isTyping
      })
    });
  }

  broadcastPresence(status: 'ONLINE' | 'OFFLINE'): void {
    if (!this.stompClient?.connected) return;

    this.stompClient.publish({
      destination: '/app/presence',
      body: JSON.stringify({ status })
    });
  }

  
  startViewing(channelId: string) {
    if (!this.stompClient?.connected) return;
    this.stompClient.publish({
      destination: '/app/channel/view/start',
      body: JSON.stringify({ channelId }),
    });
  }

  stopViewing(channelId: string) {
    if (!this.stompClient?.connected) return;
    this.stompClient.publish({
      destination: '/app/channel/view/end',
      body: JSON.stringify({ channelId }),
    });
  }

 
}