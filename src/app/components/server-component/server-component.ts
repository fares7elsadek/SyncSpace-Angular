import { Component, OnInit, signal, WritableSignal } from '@angular/core';
import { ChannelSidebarComponent } from '../channel-sidebar-component/channel-sidebar-component';
import { TopBarComponent } from '../top-bar-component/top-bar-component';
import { MessageComposer } from '../message-composer/message-composer';
import { MembersListComponent } from '../members-list-component/members-list-component';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { ChannelDto } from '../../models/api.model';
import { ApiService } from '../../services/api.service';


@Component({
  selector: 'app-server-component',
  standalone: true,
  imports: [ChannelSidebarComponent, TopBarComponent, MessageComposer, MembersListComponent, CommonModule,RouterOutlet],
  templateUrl: './server-component.html',
  styleUrl: './server-component.css'
})
export class ServerComponent implements OnInit {

  channels: WritableSignal<ChannelDto[]> = signal([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService:ApiService
  ) {}


  ngOnInit(): void {
    this.route.paramMap.subscribe((params)=>{
        let serverId = params.get("serverId");
        if(serverId){
          this.apiService.getChannels(serverId)
          .subscribe((response)=>{
            if(response.data.length > 0){
              const generalChannel = response.data[0];
              this.router.navigate([`/app/server/${serverId}/channel/${generalChannel.id}`]);
            }
          })
        }
    })
  }

 
}
