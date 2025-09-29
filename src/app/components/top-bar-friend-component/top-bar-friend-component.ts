import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { NotificationDto } from '../../models/api.model';

interface Notification {
  id: string;
  type: 'DIRECT_MESSAGE' | 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'SYSTEM' | "GROUP_MESSAGE";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  avatar?: string;
  actionable?: boolean;
  relatedEntityId: string;
}

@Component({
  selector: 'app-top-bar-friend-component',
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './top-bar-friend-component.html',
  styleUrl: './top-bar-friend-component.css'
})
export class TopBarFriendComponent implements OnInit, OnDestroy {

  showAddFriendModal = signal(false);
  showNotificationsModal = signal(false);
  isSendingRequest = signal(false);
  errorMessage = signal("");
  
  username: string = "";
  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  page = 1;
  size = 20;

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router, 
    private apiService: ApiService, 
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    // this.loadNotifications();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isActive(route: string): boolean {
    return this.router.url.startsWith(route);
  }

  // Friend Request Methods
  sendFriendRequest() {
    if (!this.username.trim()) return;
    
    this.isSendingRequest.set(true);
    this.errorMessage.set("");
    
    this.apiService.sendFriendRequest(this.username.trim())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success("Friend request sent successfully");
          this.closeAddFriendModal();
        },
        error: (err) => {
          const errorMsg = err?.error?.error || err?.message || 'An error occurred while sending the request';
          this.errorMessage.set(errorMsg);
          this.isSendingRequest.set(false);
        }
      });
  }

  closeAddFriendModal() {
    this.showAddFriendModal.set(false);
    this.isSendingRequest.set(false);
    this.username = "";
    this.errorMessage.set("");
  }

  // Notification Methods
  loadNotifications() {
    if (this.page < 1 || this.size < 1) return;

    this.apiService.getNotifications(this.page, this.size)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Clear existing notifications when reloading
          this.notifications.set([]);
          
          if (response?.data && Array.isArray(response.data)) {
            response.data.forEach(ntf => {
              this.processNotification(ntf);
            });
            this.updateUnreadCount();
          }
        },
        error: (err) => {
          console.error('Error loading notifications:', err);
          this.toastr.error('Failed to load notifications');
        }
      });
  }

  private processNotification(ntf: NotificationDto) {
    switch (ntf.type) {
      case "FRIEND_REQUEST":
        this.handleFriendRequest(ntf);
        break;
      case "FRIEND_ACCEPTED":
        this.handleFriendAccepted(ntf);
        break;
      case "GROUP_MESSAGE":
      case "DIRECT_MESSAGE":
        this.handleIncomingMessage(ntf);
        break;
      default:
        this.handleDefaultCase(ntf);
    }
  }

  handleFriendRequest(ntf: NotificationDto) {
    if (!ntf.relatedEntityId) {
      console.warn('No related entity ID for friend request notification');
      return;
    }

    this.apiService.getFriend(ntf.relatedEntityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.data) {
            const request = response.data;
            const { title, message } = this.getNotificationContent(ntf.type, request.user?.username || 'Unknown User');
            const notification: Notification = {
              id: ntf.id,
              type: ntf.type,
              title: title,
              message: message,
              timestamp: ntf.createdAt,
              read: ntf.read,
              avatar: request.user?.avatarUrl,
              actionable: true,
              relatedEntityId: request.id
            };
            this.addNotification(notification);
          }
        },
        error: (err) => {
          console.error('Error fetching friend request details:', err);
          
          this.handleDefaultCase(ntf);
        }
      });
  }

  handleFriendAccepted(ntf: NotificationDto) {
    if (!ntf.relatedEntityId) {
      console.warn('No related entity ID for friend accepted notification');
      return;
    }

    this.apiService.getFriend(ntf.relatedEntityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.data) {
            const request = response.data;
            const { title, message } = this.getNotificationContent(ntf.type, request.user?.username || 'Unknown User');
            const notification: Notification = {
              id: ntf.id,
              type: ntf.type,
              title: title,
              message: message,
              timestamp: ntf.createdAt,
              read: ntf.read,
              avatar: request.user?.avatarUrl,
              actionable: false,
              relatedEntityId: request.id
            };
            this.addNotification(notification);
          }
        },
        error: (err) => {
          console.error('Error fetching friend accepted details:', err);
          this.handleDefaultCase(ntf);
        }
      });
  }

  handleIncomingMessage(ntf: NotificationDto) {
    if (!ntf.relatedEntityId) {
      console.warn('No related entity ID for message notification');
      return;
    }

    this.apiService.getMessage(ntf.relatedEntityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response?.data) {
            const messageData = response.data;
            const { title, message } = this.getNotificationContent(ntf.type, messageData.sender?.username || 'Unknown User');
            const notification: Notification = {
              id: ntf.id,
              type: ntf.type,
              title: title,
              message: message,
              timestamp: ntf.createdAt,
              read: ntf.read,
              avatar: messageData.sender?.avatarUrl,
              actionable: true,
              relatedEntityId: messageData.messageId 
            };
            this.addNotification(notification);
          }
        },
        error: (err) => {
          console.error('Error fetching message details:', err);
          this.handleDefaultCase(ntf);
        }
      });
  }

  handleDefaultCase(ntf: NotificationDto) {
    const { title, message } = this.getNotificationContent(ntf.type, 'System');
    const notification: Notification = {
      id: ntf.id,
      type: ntf.type,
      title: title,
      message: message,
      timestamp: ntf.createdAt,
      read: ntf.read,
      actionable: false,
      relatedEntityId: ntf.relatedEntityId || ''
    };
    this.addNotification(notification);
  }

  private addNotification(notification: Notification) {
    this.notifications.update(current => {
      const exists = current.find(n => n.id === notification.id);
      if (!exists) {
        return [...current, notification];
      }
      return current;
    });
  }

  

  getNotificationContent(type: string, user: string): { title: string; message: string } {
    switch (type) {
      case "DIRECT_MESSAGE":
        return {
          title: `New Message`,
          message: `${user} sent you a new message.`,
        };
      case "GROUP_MESSAGE":
        return {
          title: `New Group Message`,
          message: `${user} posted in the group.`,
        };
      case "FRIEND_REQUEST":
        return {
          title: `Friend Request`,
          message: `${user} wants to connect with you.`,
        };
      case "FRIEND_ACCEPTED":
        return {
          title: `Friend Request Accepted`,
          message: `${user} accepted your friend request.`,
        };
      case "SYSTEM":
      default:
        return {
          title: `System Notification`,
          message: user === 'System' ? "System message" : `Notification from ${user}`,
        };
    }
  }

  updateUnreadCount() {
    const unread = this.notifications().filter(n => !n.read).length;
    this.unreadCount.set(unread);
  }

  markAsRead(notificationId: string) {
    this.apiService.markNotificationAsRead(notificationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Update local state
          this.notifications.update(current => 
            current.map(n => 
              n.id === notificationId ? { ...n, read: true } : n
            )
          );
          this.updateUnreadCount();
        },
        error: (err) => {
          console.error('Error marking notification as read:', err);
          this.toastr.error('Failed to mark notification as read');
        }
      });
  }

  markAllAsRead() {
    this.apiService.markAllNotificationsAsRead()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Update local state
          this.notifications.update(current => 
            current.map(n => ({ ...n, read: true }))
          );
          this.updateUnreadCount();
          this.toastr.success('All notifications marked as read');
        },
        error: (err) => {
          console.error('Error marking all notifications as read:', err);
          this.toastr.error('Failed to mark all notifications as read');
        }
      });
  }

  deleteNotification(notificationId: string) {
    this.apiService.deleteNotification(notificationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notifications.update(current => 
            current.filter(n => n.id !== notificationId)
          );
          this.updateUnreadCount();
          this.toastr.success("Notification deleted successfully");
        },
        error: (err) => {
          console.error('Error deleting notification:', err);
          this.toastr.error('Failed to delete notification');
        }
      });
  }

  acceptFriendRequest(entityId: string) {
    if (!entityId) {
      this.toastr.error('Invalid friend request');
      return;
    }

    this.apiService.acceptFriendRequest(entityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success("Friend request accepted successfully");
          this.loadNotifications();
        },
        error: (err) => {
          console.error('Error accepting friend request:', err);
          this.toastr.error('Failed to accept friend request');
        }
      });
  }

  rejectFriendRequest(entityId: string) {
    if (!entityId) {
      this.toastr.error('Invalid friend request');
      return;
    }

    this.apiService.rejectFriendRequest(entityId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.toastr.success("Friend request rejected successfully");
          this.loadNotifications();
        },
        error: (err) => {
          console.error('Error rejecting friend request:', err);
          this.toastr.error('Failed to reject friend request');
        }
      });
  }

  closeNotificationsModal() {
    this.showNotificationsModal.set(false);
  }

  toggleNotificationsModal() {
    this.showNotificationsModal.set(!this.showNotificationsModal());
    if (this.showNotificationsModal()) {
      this.loadNotifications();
    }
  }

  getNotificationIcon(type: string): string {
    switch (type) {
      case 'FRIEND_REQUEST':
        return 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z';
      case 'GROUP_MESSAGE':
      case 'DIRECT_MESSAGE':
        return 'M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z';
      default:
        return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z';
    }
  }

 
  clearAllNotifications() {
    this.notifications.set([]);
    this.updateUnreadCount();
    this.toastr.success('All notifications cleared');
  }
}