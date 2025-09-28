import { Component, EventEmitter, OnDestroy, OnInit, Output, signal, WritableSignal, ɵclearResolutionOfComponentResourcesQueue } from '@angular/core';
import { ChannelDto, CreateChannelRequest, ServerDto, UserDto } from '../../models/api.model';
import {  Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserAreaComponent } from '../user-area-component/user-area-component';
import { NewMemberEvent } from '../../services/new-member-event';



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
  showServerMenu = signal(false);
  errorMessage = signal("");
  showAddMemberModal = signal(false);
  memberToAdd = '';
  showInviteModal = signal(false);
  inviteCode = "";
  inviteCodeUrl = signal('');
  showDeleteModal = signal(false);
  deleteConfirmation = '';
  isAddingMember = signal(false);


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
    ,private tostr:ToastrService,private newMemberEvent:NewMemberEvent){}

  ngOnInit() {
  this.activatedRoute.paramMap
    .pipe(takeUntil(this.destroy$))
    .subscribe((params) => {
      const id = params.get('serverId');
      if (!id) {
        console.warn('No serverId found in route');
        return;
      }

      this.serverId = id;
      this.newChannel.serverId = id; // <-- IMPORTANT: update the request object too

      this.loadServerInfo();
      this.loadChannels();
    });
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
    console.log(this.newChannel)
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


  // Server menu toggle
  toggleServerMenu() { 
    this.showServerMenu.set(!this.showServerMenu()); 
  }

  closeServerMenu() {
     this.showServerMenu.set(false); 
  }

  // Add Member Modal
  openAddMemberModal() {
     this.closeServerMenu(); this.showAddMemberModal.set(true); 
  }

  closeAddMemberModal() {
     this.showAddMemberModal.set(false); this.memberToAdd = ''; 
     this.isAddingMember.set(false)
     this.errorMessage.set('')
  }

  addMember() { 
    if(!this.serverId.trim() || !this.memberToAdd.trim()){
      this.errorMessage.set("Username can't be blank");
      return;
    }
    this.isAddingMember.set(true)
    this.apiService.addServerMember(this.serverId,this.memberToAdd)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next:(response)=>{
        this.tostr.success(response.message);
        this.isAddingMember.set(false)
        this.closeAddMemberModal();
        this.newMemberEvent.notifyNewMemberEvent();
      },
      error:(err)=>{
        this.tostr.error(err.error.error);
        this.errorMessage.set(err.error.error);
        this.isAddingMember.set(false)
      }
    })

  }

  // Invite Code Modal
  openInviteModal() {
     this.closeServerMenu(); this.showInviteModal.set(true); 
  }

  closeInviteModal() {
     this.showInviteModal.set(false); 
  }

  generateInviteCode() { 
    if(!this.serverId.trim()){
      this.tostr.error("Server id not visible");
      return;
    }
    this.apiService.getInviteCode(this.serverId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next:(response)=>{
        this.inviteCode= response.data.code;
        this.inviteCodeUrl.set(`http://${window.location.hostname}:${window.location.port}/invite/server/${this.serverId}?code=${this.inviteCode}`);
        this.openInviteModal();
      },
      error:(err)=>{
        this.tostr.error(err.error.error);
      }
    })
  }

  copyInviteCode() { 
    if (!this.inviteCodeUrl()) return;

    navigator.clipboard.writeText(this.inviteCodeUrl())
      .then(() => {
        this.tostr.success("Invite link copied to clipboard!");
      })
      .catch(() => {
        this.tostr.error("Failed to copy. Try manually.");
      });
  }


  // Delete Server Modal
  openDeleteServerModal() {
     this.closeServerMenu(); this.showDeleteModal.set(true); 
  }

  closeDeleteModal() {
     this.showDeleteModal.set(false); this.deleteConfirmation = '';
  }

  deleteServer() { 

  }


}
