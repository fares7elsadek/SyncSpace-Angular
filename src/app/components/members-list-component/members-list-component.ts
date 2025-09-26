import { Component, OnDestroy, OnInit, signal, WritableSignal } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { ActivatedRoute } from '@angular/router';
import { ServerMember } from '../../models/api.model';
import { ToastrService } from 'ngx-toastr';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-members-list-component',
  imports: [CommonModule,FormsModule],
  templateUrl: './members-list-component.html',
  styleUrl: './members-list-component.css'
})
export class MembersListComponent implements OnInit,OnDestroy {
    private destroy$ = new Subject<void>();
    serverId = signal('');
    public members:WritableSignal<ServerMember[]> = signal([]);

    constructor(private apiService:ApiService
      ,private activatedRoute:ActivatedRoute
      ,private tostr:ToastrService){}

    ngOnInit(): void {

      this.activatedRoute.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((param)=>{
          let serverId = param.get("serverId");
          if(serverId){
              this.serverId.set(serverId);
              this.loadMembers();
          }
      })

    }

    ngOnDestroy(): void {
      this.destroy$.next();
      this.destroy$.complete();
    }

    loadMembers(){
      if(!this.serverId().trim())
          return;
      this.apiService.getServerMembers(this.serverId())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:(response)=>{
          this.members.set(response.data);
        },
        error:(err)=>{  
          this.tostr.error(err.error.error);
        }
      })
    }
  
    memberStatus(online: boolean): string {
    return online ? 'online' : 'offline';
  }

  getOnlineNumber(members: ServerMember[]){
    return members.filter((member) => member.serverUserDto.isOnline).length;
  }

  getOfflineNumber(members: ServerMember[]){
    return members.filter((member) => !member.serverUserDto.isOnline).length;
  }


}
