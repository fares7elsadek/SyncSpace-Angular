import { Component } from '@angular/core';
import { ChannelSidebarComponent } from '../channel-sidebar-component/channel-sidebar-component';
import { TopBarComponent } from '../top-bar-component/top-bar-component';
import { ChannelChatMessagesComponent } from '../channel-chat-messages-component/channel-chat-messages-component';
import { MessageComposer } from '../message-composer/message-composer';
import { MembersListComponent } from '../members-list-component/members-list-component';
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-server-component',
  standalone: true,
  imports: [ChannelSidebarComponent, TopBarComponent, ChannelChatMessagesComponent, MessageComposer, MembersListComponent, CommonModule],
  templateUrl: './server-component.html',
  styleUrl: './server-component.css'
})
export class ServerComponent {

}
