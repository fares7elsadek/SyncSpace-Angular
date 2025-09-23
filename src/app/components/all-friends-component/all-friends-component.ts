import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal, WritableSignal } from '@angular/core';
import { Subject } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ToastrService } from 'ngx-toastr';
import { FriendshipDto } from '../../models/api.model';

@Component({
  selector: 'app-all-friends-component',
  imports: [CommonModule],
  templateUrl: './all-friends-component.html',
  styleUrl: './all-friends-component.css'
})
export class AllFriendsComponent implements OnInit,OnDestroy {
  friends: WritableSignal<FriendshipDto[]> = signal([]);
  
  private destroy$ = new Subject<void>();
  activeFriendOptions = signal("");

  constructor(private apiServer:ApiService,private toastr:ToastrService){}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.loadFriends();
  }


  loadFriends(){
    this.apiServer.getFriends()
    .subscribe({
      next:(response)=>{
        this.friends.set(response.data);
      },
      error:(err)=>{
        this.toastr.error(err.error.error);
      }
    })
  }

  toggleOptions(userId: string, event: MouseEvent) {
    event.stopPropagation();
    this.activeFriendOptions.set(this.activeFriendOptions() === userId ? "" : userId);
  }

  closeOptions() {
    this.activeFriendOptions.set("");
  }

  startDM(name: any){

  }

  showFriendOptions(name: any){
    
  }

  removeFriend(userId: string){
    this.apiServer.removeFriend(userId)
    .subscribe({
      next:()=>{
        this.toastr.success("Friend remove successfully");
        this.loadFriends();
      },
      error:(err)=>{
        this.toastr.error(err.error.error);
      }
    })
  }

  friendStatus(online: boolean): string{
    return online ? 'online' : 'offline';
  }
}
