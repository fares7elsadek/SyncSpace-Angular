import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-top-bar-friend-component',
  imports: [RouterLink,CommonModule,FormsModule],
  templateUrl: './top-bar-friend-component.html',
  styleUrl: './top-bar-friend-component.css'
})
export class TopBarFriendComponent implements OnInit,OnDestroy{

  showAddFriendModal = signal(false);
  isSendingRequest = signal(false);
  errorMessage = signal("");

  username: string = "";

  private destroy$ = new Subject<void>();
  constructor(private router:Router,private apiService:ApiService,private toastr: ToastrService){}

   ngOnInit(): void {
    
   }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isActive(route: string): boolean{
    return this.router.url.startsWith(route);
  }

  sendFriendRequest(){
    if(!this.username.trim())return;
    this.isSendingRequest.set(true);
    this.apiService.sendFriendRequest(this.username.trim())
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next:() =>{
        this.toastr.success("Friend request sent successfully");
        this.closeModal();
      },
      error:(err)=>{
        this.errorMessage.set(err.error.error);
        this.isSendingRequest.set(false);
      }
    })

  }

  closeModal() {
    this.showAddFriendModal.set(false);
    this.isSendingRequest.set(false);
    this.username= ""; 
    this.errorMessage.set("");
  }
}
