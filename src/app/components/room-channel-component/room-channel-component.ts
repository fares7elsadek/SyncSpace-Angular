import { Component, ElementRef, ViewChild, signal, effect, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { YouTubePlayerModule, YouTubePlayer } from '@angular/youtube-player';



interface Message {
  id: string;
  content: string;
  sender: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  sentAt: string;
  isOwnMessage: boolean;
}

interface ChatState {
  channelId: string;
  messages: Message[];
}

@Component({
  selector: 'app-room-channel-component',
  imports: [CommonModule, FormsModule, YouTubePlayerModule],
  templateUrl: './room-channel-component.html',
  styleUrl: './room-channel-component.css'
})
export class RoomChannelComponent {
  // ViewChild references
  @ViewChild('youtubePlayer') youtubePlayer?: YouTubePlayer;
  @ViewChild('chatContainer') chatContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('videoUrlInput') videoUrlInput?: ElementRef<HTMLInputElement>;

  // Signals for reactive state
  currentVideoId = signal<string>('');
  videoTitle = signal<string>('');
  videoHost = signal<string>('Unknown');
  viewerCount = signal<number>(1);
  isPlaying = signal<boolean>(false);
  isSyncing = signal<boolean>(false);
  isLoadingVideo = signal<boolean>(false);
  isLoadingMessages = signal<boolean>(false);
  isVideoCollapsed = signal<boolean>(false);
  messages = signal<ChatState>({ channelId: '', messages: [] });

  // Form inputs
  videoUrl: string = '';
  messageText: string = '';

  // Player configuration
  playerHeight: number | undefined;
  playerWidth: number | undefined;
  playerVars = {
    autoplay: 1,
    controls: 1,
    modestbranding: 1,
    rel: 0,
    showinfo: 0,
    fs: 1,
    playsinline: 1,
    origin: window.location.origin
  };

  // Chat state
  chatState = {
    channelId: 'watch-party-1' // Replace with actual channel ID
  };

  // Current user info (mock data - replace with actual auth)
  private currentUser = {
    id: 'user-1',
    username: 'CurrentUser',
    avatarUrl: undefined
  };

  constructor() {
    // Don't calculate dimensions - let CSS handle it with aspect-ratio

    // Effect to scroll chat to bottom when new messages arrive
    effect(() => {
      const msgs = this.messages();
      if (msgs.messages.length > 0) {
        setTimeout(() => this.scrollChatToBottom(), 100);
      }
    });
  }

  ngOnInit(): void {
    // Load YouTube API
    this.loadYouTubeApi();

    // Initialize with mock data (replace with actual API calls)
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  /**
   * Load YouTube IFrame API
   */
  private loadYouTubeApi(): void {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
  }

  /**
   * Load initial data (mock implementation)
   */
  private loadInitialData(): void {
    this.isLoadingMessages.set(true);

    // Simulate API call
    setTimeout(() => {
      this.messages.set({
        channelId: this.chatState.channelId,
        messages: [
          {
            id: '1',
            content: 'Welcome to the watch party! 🎉',
            sender: {
              id: 'system',
              username: 'System',
              avatarUrl: undefined
            },
            sentAt: this.formatTime(new Date()),
            isOwnMessage: false
          }
        ]
      });
      this.isLoadingMessages.set(false);
      this.videoHost.set('System');
    }, 500);
  }

  /**
   * Extract YouTube video ID from URL
   */
  private extractVideoId(url: string): string | null {
    if (!url) return null;

    // If it's already just an ID (11 characters)
    if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) {
      return url;
    }

    // Match various YouTube URL formats
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Load video from URL
   */
  loadVideo(): void {
    const videoId = this.extractVideoId(this.videoUrl);
    
    if (!videoId) {
      alert('Invalid YouTube URL or Video ID');
      return;
    }

    this.isLoadingVideo.set(true);
    this.isSyncing.set(true);

    // Simulate loading
    setTimeout(() => {
      this.currentVideoId.set(videoId);
      this.videoTitle.set('Loading video...');
      this.videoHost.set(this.currentUser.username);
      this.isLoadingVideo.set(false);
      this.isVideoCollapsed.set(false); // Reset collapse state when loading new video
      
      // Add system message
      this.addSystemMessage(`${this.currentUser.username} started playing a video`);
      
      // Clear input
      this.videoUrl = '';
      
      // Fetch video details (in real app, use YouTube Data API)
      this.fetchVideoDetails(videoId);
      
      setTimeout(() => this.isSyncing.set(false), 1000);
    }, 800);
  }

  /**
   * Fetch video details from YouTube Data API
   * Note: In production, you'll need a YouTube API key
   */
  private fetchVideoDetails(videoId: string): void {
    // Mock implementation
    // In production, call: https://www.googleapis.com/youtube/v3/videos?id={videoId}&key={API_KEY}&part=snippet
    
    setTimeout(() => {
      this.videoTitle.set('Awesome Video Title - Replace with real API call');
    }, 500);
  }

  /**
   * YouTube Player ready event
   */
  onPlayerReady(event: any): void {
    console.log('YouTube Player Ready', event);
    // You can add custom logic here
  }

  /**
   * YouTube Player state change event
   */
  onPlayerStateChange(event: any): void {
    // YouTube Player States:
    // -1 (unstarted)
    // 0 (ended)
    // 1 (playing)
    // 2 (paused)
    // 3 (buffering)
    // 5 (video cued)
    
    const state = event.data;
    this.isPlaying.set(state === 1);

    if (state === 0) {
      this.addSystemMessage('Video ended');
    } else if (state === 1) {
      // Video is playing - sync with other users here
      this.syncVideoState();
    } else if (state === 2) {
      this.addSystemMessage('Video paused');
    }
  }

  /**
   * Sync video state with other users (WebSocket/SignalR implementation needed)
   */
  private syncVideoState(): void {
    // In production, emit video state to all connected users
    // Example: WebSocket emit with current time, playing state, etc.
    console.log('Syncing video state...');
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void {
    if (!this.youtubePlayer) return;

    if (this.isPlaying()) {
      this.youtubePlayer.pauseVideo();
    } else {
      this.youtubePlayer.playVideo();
    }
  }

  /**
   * Skip forward 10 seconds
   */
  skipForward(): void {
    // if (!this.youtubePlayer) return;

    // this.youtubePlayer.getCurrentTime().then(currentTime => {
    //   this.youtubePlayer!.seekTo(currentTime + 10, true);
    // });
  }

  /**
   * Stop video and clear
   */
  stopVideo(): void {
    if (confirm('Stop and remove the current video?')) {
      this.currentVideoId.set('');
      this.videoTitle.set('');
      this.isPlaying.set(false);
      this.isVideoCollapsed.set(false); // Reset collapse state
      this.addSystemMessage('Video stopped');
    }
  }

  /**
   * Send chat message
   */
  sendMessage(): void {
    const text = this.messageText?.trim();
    if (!text) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      content: text,
      sender: {
        id: this.currentUser.id,
        username: this.currentUser.username,
        avatarUrl: this.currentUser.avatarUrl
      },
      sentAt: this.formatTime(new Date()),
      isOwnMessage: true
    };

    // Add message to state
    const currentMessages = this.messages();
    this.messages.set({
      ...currentMessages,
      messages: [...currentMessages.messages, newMessage]
    });

    // Clear input
    this.messageText = '';

    // In production: Send to server via WebSocket/API
    console.log('Sending message:', newMessage);
  }

  /**
   * Add system message
   */
  private addSystemMessage(content: string): void {
    const systemMessage: Message = {
      id: `system-${Date.now()}`,
      content,
      sender: {
        id: 'system',
        username: 'System',
        avatarUrl: undefined
      },
      sentAt: this.formatTime(new Date()),
      isOwnMessage: false
    };

    const currentMessages = this.messages();
    this.messages.set({
      ...currentMessages,
      messages: [...currentMessages.messages, systemMessage]
    });
  }

  /**
   * Toggle video collapse state
   */
  toggleVideoCollapse(): void {
    this.isVideoCollapsed.set(!this.isVideoCollapsed());
    
    // Optional: Pause video when collapsed
    // if (this.isVideoCollapsed() && this.youtubePlayer) {
    //   this.youtubePlayer.pauseVideo();
    // }
  }

  /**
   * Scroll to video input
   */
  scrollToInput(): void {
    this.videoUrlInput?.nativeElement.focus();
    this.videoUrlInput?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Scroll chat to bottom
   */
  private scrollChatToBottom(): void {
    if (this.chatContainer) {
      const element = this.chatContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  /**
   * Format timestamp
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Track by function for ngFor optimization
   */
  trackByMessageId(index: number, message: Message): string {
    return message.id;
  }

}
