import { Component, EventEmitter, OnDestroy, OnInit, Output, signal, WritableSignal, ɵclearResolutionOfComponentResourcesQueue } from '@angular/core';
import { ChannelDto, CreateChannelRequest, ServerDto, UserDto } from '../../models/api.model';
import {  Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserAreaComponent } from '../user-area-component/user-area-component';



@Component({
  selector: 'app-channel-sidebar-component',
  imports: [CommonModule, FormsModule, RouterLink,UserAreaComponent],
  templateUrl: './channel-sidebar-component.html',
  styleUrl: './channel-sidebar-component.css'
})
export class ChannelSidebarComponent implements OnInit,OnDestroy {
  channels: WritableSignal<ChannelDto[]> = signal([]);
  server: WritableSignal<ServerDto | null> = signal(null);
  showCreateChannelModal = signal(false);
  isCreatingChannel = signal(false);
  errorMessage = signal("");
  private destroy$ = new Subject<void>();
  serverId = "";

  newChannel: CreateChannelRequest = {
    name: "",
    description: "",
    isPrivate: false,
    serverId: this.serverId
  }
  
  constructor(private apiService: ApiService,
    private router:Router,private activatedRoute:ActivatedRoute
    ,private tostr:ToastrService){}

  ngOnInit() {
    this.activatedRoute.paramMap.subscribe((params)=>{
      this.serverId = params.get("serverId")!;
      this.loadServerInfo();
      this.loadChannels();
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }


  loadChannels(){
    if(!this.serverId) return;
    this.apiService.getChannels(this.serverId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next:(response)=>{
        this.channels.set(response.data);
      },
      error:(err)=>{
        this.tostr.error(err.error.error);
      }
    })
  }

  loadServerInfo(){
    if(!this.serverId) return;
    this.apiService.getServer(this.serverId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next:(response)=>{
        this.server.set(response.data);
      },
      error:(err)=>{
        this.tostr.error(err.error.error);
      }
    })
  }

  createChannel(){
    if(!this.newChannel.name.trim())return;
    this.isCreatingChannel.set(true);
    this.apiService.createChannel(this.newChannel)
    .subscribe({
        next: ()=>{
          this.tostr.success("Channel created successfully");
          this.loadChannels();
          this.closeModal();
        },
        error:(err)=>{
          this.errorMessage.set(err.error.error);
          this.isCreatingChannel.set(false);
        }
    })
  }


  isActive(route: string): boolean{
    return this.router.url == route;
  }

  closeModal() {
    this.showCreateChannelModal.set(false);
    this.isCreatingChannel.set(false);
    this.newChannel= {
      name: "",
      description: "",
      isPrivate: false,
      serverId: this.serverId
    }; 
    this.errorMessage.set("");
  }
}
