import { Component, ElementRef, ViewChild, signal, effect, OnInit, OnDestroy, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { YouTubePlayerModule, YouTubePlayer } from '@angular/youtube-player';
import { RoomState, UserDto, VideoControlEvent } from '../../models/api.model';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ToastrService } from 'ngx-toastr';
import { WebsocketService } from '../../services/websocket.service';
import { AuthService } from '../../services/auth.service';

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
export class RoomChannelComponent implements OnInit, OnDestroy {
  
  @ViewChild('youtubePlayer') youtubePlayer?: YouTubePlayer;
  @ViewChild('chatContainer') chatContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('videoUrlInput') videoUrlInput?: ElementRef<HTMLInputElement>;

  // Signals
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
  
  private destroy$ = new Subject<void>();
  private isConnected$ = new BehaviorSubject<boolean>(false);
  
  // Player state management
  private playerReady = false;
  private playerReadyPromise?: Promise<void>;
  private playerReadyResolver?: () => void;
  private localStop = false;
  private lastSeekTime = 0;
  private seekDebounceTimeout?: any;
  private syncCheckInterval?: any;
  
  private readonly SYNC_THRESHOLD = 2.5;
  private readonly SYNC_CHECK_INTERVAL = 15000; // 15 seconds
  
  private currentState: RoomState = {
    roomId: "",
    videoUrl: "",
    currentTimestamp: 0,
    isPlaying: false,
    lastUpdatedAt: "",
    playbackRate: 1,
  };
  
  
  private clientReceivedAt: number = 0;

  // Form inputs
  videoUrl: string = '';
  messageText: string = '';
  channelId: string = '';

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

  private currentUser: WritableSignal<UserDto | null> = signal(null);

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService,
    private tostr: ToastrService,
    private websocketService: WebsocketService,
    private authService:AuthService
  ) {
    effect(() => {
      const msgs = this.messages();
      if (msgs.messages.length > 0) {
        setTimeout(() => this.scrollChatToBottom(), 100);
      }
    });
  }

  
  ngOnInit(): void {
    this.loadYouTubeApi();
    this.loadCurrentUser();
    
    this.route.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        let roomId = params.get("roomId");
        if (!roomId?.trim()) return;

        if (this.channelId && this.channelId !== roomId) {
          console.log('[Room] Room changed, cleaning up previous room:', this.channelId);
          this.cleanupCurrentRoom();
        }

        this.channelId = roomId;
        this.connectToRoom(this.channelId);
      });

    this.loadInitialData();
    this.startPeriodicSyncCheck();
  }


  private cleanupCurrentRoom(): void {
    console.log('[Room] Cleaning up room:', this.channelId);
    
    // Clear intervals
    this.clearSyncCheckInterval();
    clearTimeout(this.seekDebounceTimeout);
    
    // Stop video if host
    if (this.isHost() && this.hasActiveVideo()) {
      this.stopVideoOnLeave();
    }
    
    // Stop viewing the current room
    if (this.channelId) {
      this.websocketService.stopViewing(this.channelId);
    }
    
    // Reset all state
    this.resetVideoState();
    this.playerReady = false;
    this.playerReadyPromise = undefined;
    this.playerReadyResolver = undefined;
    this.localStop = false;
    this.lastSeekTime = 0;
    this.clientReceivedAt = 0;
    this.isConnected$.next(false);
    
    // Reset signals
    this.isPlaying.set(false);
    this.isSyncing.set(false);
    this.isLoadingVideo.set(false);
    this.viewerCount.set(1);
    
    // Clear messages
    this.messages.set({ channelId: '', messages: [] });
    
    // Clear form inputs
    this.videoUrl = '';
    this.messageText = '';
    
    console.log('[Room] Cleanup complete');
  }


  ngOnDestroy(): void {
    this.cleanupCurrentRoom();
    
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCurrentUser(): void {
    this.currentUser.set(this.authService.getCurrentUser());
  }

  private startPeriodicSyncCheck(): void {
    this.syncCheckInterval = setInterval(() => {
      if (this.playerReady && this.currentVideoId() && !this.isHost()) {
        this.performSyncCheck();
      }
    }, this.SYNC_CHECK_INTERVAL);
  }

  private clearSyncCheckInterval(): void {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
    }
  }

  private async performSyncCheck(): Promise<void> {
    try {
      const currentTime = await this.getCurrentTime();
      const expectedTime = this.calculateCurrentTimestamp(this.currentState);
      const drift = Math.abs(currentTime - expectedTime);

      if (drift > this.SYNC_THRESHOLD) {
        console.log('[SyncCheck] Drift detected:', drift, 'seconds. Resyncing...');
        await this.synchronizePlayer(this.currentState);
      }
    } catch (error) {
      console.error('[SyncCheck] Error during sync check:', error);
    }
  }

  connectToRoom(channelId: string): void {
    console.log('[RoomService] ========== CONNECTING TO ROOM ==========');
    console.log('[RoomService] Room ID:', channelId);
    
    this.apiService.fetchRoomState(channelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          let data = response.data;
          
          
          this.clientReceivedAt = Date.now();
          
          console.log('[RoomService] Room state received:', JSON.stringify(data));
          console.log('[RoomService] Video URL:', data.videoUrl);
          console.log('[RoomService] Current Timestamp:', data.currentTimestamp);
          console.log('[RoomService] Is Playing:', data.isPlaying);
          console.log('[RoomService] Client Received At:', new Date(this.clientReceivedAt).toISOString());
          
          this.currentState = data;
          
          if (data.videoUrl?.trim()) {
            console.log('[RoomService] Applying video to late joiner...');
            this.applyToVideo(data);
          }
          
          
          this.subscribeToRoomUpdates(data.roomId);
          this.isConnected$.next(true);
          
          this.websocketService.getRoomResetEvent(data.roomId)
            .pipe(takeUntil(this.destroy$))
            .subscribe(() => {
              if (this.localStop) {
                this.localStop = false;
                return;
              }
              this.resetVideoState();
            });
        },
        error: (error) => {
          console.error('[RoomService] Error fetching room state:', error);
          this.tostr.error('Failed to connect to room');
        }
      });
  }

  private subscribeToRoomUpdates(channelId: string): void {
    console.log('[RoomService] Subscribing to WebSocket room updates');
    this.websocketService.subscribeToRoom(channelId);

    this.websocketService.getRoomControlEvents(channelId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        console.log('[RoomService] Room control event received:', event);
        this.handleRemoteEvent(event);
      });
  }

  private async handleRemoteEvent(event: VideoControlEvent): Promise<void> {
    console.log('[RoomService] Handling remote event:', event.action);
    
    
    this.clientReceivedAt = Date.now();
    
    const updatedState = { ...this.currentState };

    switch (event.action) {
      case 'PLAY':
        updatedState.isPlaying = true;
        updatedState.currentTimestamp = event.timestamp || this.currentState.currentTimestamp;
        updatedState.lastUpdatedAt = new Date().toISOString();
        break;

      case 'PAUSE':
        updatedState.isPlaying = false;
        updatedState.currentTimestamp = event.timestamp || this.currentState.currentTimestamp;
        updatedState.lastUpdatedAt = new Date().toISOString();
        break;

      case 'SEEK':
        updatedState.currentTimestamp = event.timestamp!;
        updatedState.lastUpdatedAt = new Date().toISOString();
        break;

      case 'CHANGE_VIDEO':
        updatedState.videoUrl = event.videoUrl!;
        updatedState.currentTimestamp = 0;
        updatedState.isPlaying = false;
        updatedState.lastUpdatedAt = new Date().toISOString();
        updatedState.hoster = event.user;
        this.addSystemMessage(`${event.user.username} started playing a video`);
        break;
    }
    
    this.currentState = updatedState;
    await this.applyToVideo(updatedState);
  }

  async applyToVideo(state: RoomState): Promise<void> {
    const videoId = this.extractVideoId(state.videoUrl);
    if (!videoId) {
      this.tostr.error('Invalid YouTube URL or Video ID');
      return;
    }

    const isNewVideo = this.currentVideoId() !== videoId;
    
    
    this.currentState = state;
    
    if (isNewVideo) {
      this.isLoadingVideo.set(true);
      this.playerReady = false;
      this.currentVideoId.set(videoId);
      this.videoTitle.set('Loading video...');
      this.videoHost.set(state.hoster?.username || 'Unknown');
      this.isVideoCollapsed.set(false);
      this.fetchVideoDetails(videoId);
      
      
      this.playerReadyPromise = new Promise(resolve => {
        this.playerReadyResolver = resolve;
      });
      
      
      try {
        await this.playerReadyPromise;
        console.log('[RoomService] Player ready, initial sync completed in onPlayerReady');
        this.isLoadingVideo.set(false);
      } catch (error) {
        console.error('[RoomService] Player ready timeout:', error);
        this.isLoadingVideo.set(false);
        return;
      }
    } else {
      console.log('[RoomService] Synchronizing player with updated state:', state);
      await this.synchronizePlayer(state);
    }
  }

  private async synchronizePlayer(state: RoomState): Promise<void> {
    if (!this.playerReady || !this.youtubePlayer) {
      console.log('[RoomService] Player not ready for sync');
      return;
    }

    this.isSyncing.set(true);
    
    try {
      const actualTimestamp = this.calculateCurrentTimestamp(state);
      console.log('[RoomService] Calculated timestamp:', actualTimestamp);

      // Get current player state
      const currentTime = await this.getCurrentTime();
      const playerState = await this.youtubePlayer.getPlayerState();
      const isCurrentlyPlaying = playerState === 1;
      const isBuffering = playerState === 3;
      
      console.log('[RoomService] Current time:', currentTime, 'Player state:', playerState);

      // Don't sync if buffering
      if (isBuffering) {
        console.log('[RoomService] Player is buffering, skipping sync');
        this.isSyncing.set(false);
        return;
      }

      // Check drift and seek if necessary
      const drift = Math.abs(currentTime - actualTimestamp);
      console.log('[RoomService] Drift:', drift);

      if (drift > this.SYNC_THRESHOLD) {
        console.log('[RoomService] Seeking to correct drift');
        await this.seekTo(actualTimestamp);
        // Wait a bit for seek to complete
        await this.sleep(500);
      }

      // Sync play/pause state
      if (state.isPlaying && !isCurrentlyPlaying) {
        console.log('[RoomService] Playing video');
        await this.playVideoElement();
      } else if (!state.isPlaying && isCurrentlyPlaying) {
        console.log('[RoomService] Pausing video');
        await this.pauseVideoElement();
      }

      // Sync playback rate
      if (state.playbackRate) {
        const currentRate = await this.getPlaybackRate();
        if (Math.abs(currentRate - state.playbackRate) > 0.01) {
          console.log('[RoomService] Setting playback rate:', state.playbackRate);
          await this.setPlaybackRate(state.playbackRate);
        }
      }

      this.isLoadingVideo.set(false);
      
    } catch (error) {
      console.error('[RoomService] Error synchronizing player:', error);
      this.isLoadingVideo.set(false);
    } finally {
      // Add small delay before clearing syncing flag
      await this.sleep(1000);
      this.isSyncing.set(false);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async getCurrentTime(): Promise<number> {
    if (!this.youtubePlayer) return 0;
    try {
      return await this.youtubePlayer.getCurrentTime();
    } catch (e) {
      console.error('[RoomService] Error getting current time:', e);
      return 0;
    }
  }

  private async seekTo(timestamp: number): Promise<void> {
    if (this.youtubePlayer) {
      try {
        await this.youtubePlayer.seekTo(timestamp, true);
        console.log('[RoomService] Seeked to:', timestamp);
      } catch (e) {
        console.error('[RoomService] Error seeking:', e);
      }
    }
  }

  private async playVideoElement(): Promise<void> {
    if (this.youtubePlayer) {
      try {
        await this.youtubePlayer.playVideo();
        console.log('[RoomService] Video playing');
      } catch (e) {
        console.error('[RoomService] Error playing video:', e);
      }
    }
  }

  private async pauseVideoElement(): Promise<void> {
    if (this.youtubePlayer) {
      try {
        await this.youtubePlayer.pauseVideo();
        console.log('[RoomService] Video paused');
      } catch (e) {
        console.error('[RoomService] Error pausing video:', e);
      }
    }
  }

  private async setPlaybackRate(rate: number): Promise<void> {
    if (this.youtubePlayer) {
      try {
        await this.youtubePlayer.setPlaybackRate(rate);
        console.log('[RoomService] Playback rate set to:', rate);
      } catch (e) {
        console.error('[RoomService] Error setting playback rate:', e);
      }
    }
  }

  private async getPlaybackRate(): Promise<number> {
    try {
      return await (this.youtubePlayer?.getPlaybackRate() ?? 1);
    } catch (e) {
      console.error('[RoomService] Error getting playback rate:', e);
      return 1;
    }
  }

  private calculateCurrentTimestamp(state: RoomState): number {
    if (!state.isPlaying) {
      return state.currentTimestamp;
    }

    
    const now = Date.now();
    const elapsedSeconds = (now - this.clientReceivedAt) / 1000;
    
    // Sanity check
    if (elapsedSeconds < 0 || elapsedSeconds > 86400) {
      console.warn('[calculateTimestamp] Invalid elapsed time:', elapsedSeconds, 'seconds. Using base timestamp.');
      return state.currentTimestamp;
    }
    
    const playbackRate = state.playbackRate || 1.0;
    const calculated = state.currentTimestamp + (elapsedSeconds * playbackRate);
    
    console.log('[calculateTimestamp] Base:', state.currentTimestamp, 'Elapsed:', elapsedSeconds.toFixed(3), 'Rate:', playbackRate, 'Result:', calculated.toFixed(3));
    
    return Math.max(0, calculated);
  }

  private loadYouTubeApi(): void {
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
  }

  private loadInitialData(): void {
    this.isLoadingMessages.set(true);
    this.messages.set({
      channelId: this.channelId,
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
  }

  private extractVideoId(url: string): string | null {
    if (!url) return null;

    if (url.length === 11 && /^[a-zA-Z0-9_-]+$/.test(url)) {
      return url;
    }

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

  loadVideo(): void {
    const videoId = this.extractVideoId(this.videoUrl);
    
    if (!videoId) {
      this.tostr.error('Invalid YouTube URL or Video ID');
      return;
    }

    if (!this.currentUser()?.id) {
      this.tostr.error('User not authenticated');
      return;
    }

    const event = {
      channelId: this.channelId,
      action: 'CHANGE_VIDEO',
      timestamp: 0,
      videoUrl: videoId,
      userId: this.currentUser()?.id!
    };

    this.isLoadingVideo.set(true);

    this.apiService.sendControlEvent(event)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.tostr.success(res.message);
          this.videoUrl = '';
          
        },
        error: (error) => {
          console.error('[LoadVideo] Error:', error);
          this.tostr.error('Failed to load video');
          this.isLoadingVideo.set(false);
        }
      });
  }

  private fetchVideoDetails(videoId: string): void {
    // In production, call YouTube Data API:
    // https://www.googleapis.com/youtube/v3/videos?id={videoId}&key={API_KEY}&part=snippet
    setTimeout(() => {
      this.videoTitle.set('Awesome Video Title - Replace with real API call');
    }, 500);
  }

  async onPlayerReady(event: any) {
    console.log('[Player] YouTube Player Ready', event);
    this.playerReady = true;
    
    
    const correctTimestamp = this.calculateCurrentTimestamp(this.currentState);
    console.log('[Player] ========== INITIAL SYNC START ==========');
    console.log('[Player] Current state on ready:', JSON.stringify(this.currentState));
    console.log('[Player] Calculated timestamp:', correctTimestamp, 'Should be playing:', this.currentState.isPlaying);
    
   
    if (this.currentState.videoUrl) {
      console.log('[Player] Forcing sync to position:', correctTimestamp);
      
      try {
        
        await this.sleep(500);
        
        
        console.log('[Player] Force seeking to:', correctTimestamp);
        await this.youtubePlayer?.seekTo(correctTimestamp, true);
        await this.sleep(200);
        
        
        let currentTime = await this.getCurrentTime();
        console.log('[Player] Current time after first seek:', currentTime);
        
        if (Math.abs(currentTime - correctTimestamp) > 1) {
          console.log('[Player] First seek failed, forcing again...');
          await this.youtubePlayer?.seekTo(correctTimestamp, true);
          await this.sleep(300);
          currentTime = await this.getCurrentTime();
          console.log('[Player] Current time after second seek:', currentTime);
        }
        
        
        if (this.currentState.isPlaying) {
          console.log('[Player] Starting playback for late joiner');
          await this.playVideoElement();
          
          
          await this.sleep(500);
          const finalTime = await this.getCurrentTime();
          const expectedTime = this.calculateCurrentTimestamp(this.currentState);
          const drift = Math.abs(finalTime - expectedTime);
          console.log('[Player] Final time:', finalTime, 'Expected:', expectedTime, 'Drift:', drift);
          
          if (drift > 2) {
            console.log('[Player] Large drift detected, final correction...');
            await this.youtubePlayer?.seekTo(expectedTime, true);
          }
        } else {
          console.log('[Player] Keeping video paused at:', correctTimestamp);
          await this.pauseVideoElement();
        }
        
        console.log('[Player] ========== INITIAL SYNC COMPLETE ==========');
      } catch (error) {
        console.error('[Player] Error setting initial position:', error);
      }
    }
    
    
    if (this.playerReadyResolver) {
      this.playerReadyResolver();
      this.playerReadyResolver = undefined;
    }
  }

  onPlayerStateChange(event: any): void {
    const state = event.data;
    const isHost = this.isHost();
    
    console.log('[Player] State change:', state, 'isHost:', isHost, 'isSyncing:', this.isSyncing());
    
    this.isPlaying.set(state === 1);

    
    if (this.isSyncing() || !isHost) {
      console.log('[Player] Ignoring state change - isSyncing or not host');
      return;
    }

    if (state === 0) { // Ended
      if(this.isHost() && this.hasActiveVideo()){
        this.stopVideoOnLeave();
        this.addSystemMessage('Video ended');
        this.resetVideoState();
      }
    } else if (state === 2) { 
      this.handleUserPause();
    } else if (state === 1) { 
      this.handleUserPlay();
    }
  }

  onPlayerError(event: any): void {
    const errorCode = event.data;
    let errorMessage = 'Video playback error';
    
    switch(errorCode) {
      case 2: 
        errorMessage = 'Invalid video ID'; 
        break;
      case 5: 
        errorMessage = 'HTML5 player error'; 
        break;
      case 100: 
        errorMessage = 'Video not found'; 
        break;
      case 101:
      case 150: 
        errorMessage = 'Video cannot be embedded or is restricted'; 
        break;
    }
    
    console.error('[Player] Error:', errorCode, errorMessage);
    this.tostr.error(errorMessage);
    this.isLoadingVideo.set(false);
    this.isSyncing.set(false);
    
    // Reset video state on error
    if (this.isHost()) {
      setTimeout(() => this.stopVideo(), 2000);
    }
  }

  private async handleUserPause(): Promise<void> {
    if (!this.isHost()) return;
    
    try {
      const currentTime = await this.getCurrentTime();
      await this.sendControlEvent('PAUSE', currentTime);
      this.addSystemMessage('Video paused');
    } catch (error) {
      console.error('[Player] Error handling pause:', error);
    }
  }

  private async handleUserPlay(): Promise<void> {
    if (!this.isHost()) return;
    
    try {
      const currentTime = await this.getCurrentTime();
      await this.sendControlEvent('PLAY', currentTime);
    } catch (error) {
      console.error('[Player] Error handling play:', error);
    }
  }

  private async sendControlEvent(action: string, timestamp?: number): Promise<void> {
    if (!this.currentUser()?.id) return;
    
    const event = {
      channelId: this.channelId,
      action,
      timestamp: timestamp ?? 0,
      videoUrl: this.currentState.videoUrl,
      userId: this.currentUser()?.id!
    };
    
    this.apiService.sendControlEvent(event)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => console.log('[Control] Event sent:', action),
        error: (error) => console.error('[Control] Error sending event:', error)
      });
  }

  togglePlayPause(): void {
    if (!this.youtubePlayer || !this.isHost()) return;

    if (this.isPlaying()) {
      this.youtubePlayer.pauseVideo();
    } else {
      this.youtubePlayer.playVideo();
    }
  }

  async skipForward(): Promise<void> {
    if (!this.youtubePlayer || !this.isHost()) return;
    
    try {
      const currentTime = await this.getCurrentTime();
      const newTime = currentTime + 10;
      await this.seekTo(newTime);
      await this.sendControlEvent('SEEK', newTime);
    } catch (error) {
      console.error('[Player] Error skipping forward:', error);
    }
  }

  stopVideo(): void {
    if (!this.isHost()) {
      this.tostr.warning('Only the host can stop the video');
      return;
    }
    
    if (confirm('Stop and remove the current video?')) {
      this.localStop = true;
      
      this.apiService.resetRoomState(this.channelId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            console.log('[Stop] Video stopped successfully');
            this.resetVideoState();
          },
          error: (error) => {
            console.error('[Stop] Error stopping video:', error);
            this.tostr.error('Failed to stop video');
            this.localStop = false;
          }
        });
    }
  }

  private stopVideoOnLeave(): void {
    this.localStop = true;
    
    this.apiService.resetRoomState(this.channelId)
      .subscribe({
        next: () => {
          console.log('[Stop] Video stopped on host leave');
        },
        error: (error) => {
          console.error('[Stop] Error stopping video on leave:', error);
        }
      });
  }

  private resetVideoState(): void {
    this.currentVideoId.set('');
    this.videoTitle.set('');
    this.isPlaying.set(false);
    this.isVideoCollapsed.set(false);
    this.playerReady = false;
    this.currentState = {
      roomId: this.channelId,
      videoUrl: "",
      currentTimestamp: 0,
      isPlaying: false,
      lastUpdatedAt: "",
      playbackRate: 1,
    };
    this.addSystemMessage('Video stopped');
  }

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

  toggleVideoCollapse(): void {
    this.isVideoCollapsed.set(!this.isVideoCollapsed());
  }

  scrollToInput(): void {
    this.videoUrlInput?.nativeElement.focus();
    this.videoUrlInput?.nativeElement.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'center' 
    });
  }

  private scrollChatToBottom(): void {
    if (this.chatContainer) {
      const element = this.chatContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  trackByMessageId(index: number, message: Message): string {
    return message.id;
  }

  isHost(): boolean {
    return this.currentUser()?.id === this.currentState.hoster?.id;
  }

  hasActiveVideo(): boolean {
    return this.currentVideoId() !== '';
  }
}