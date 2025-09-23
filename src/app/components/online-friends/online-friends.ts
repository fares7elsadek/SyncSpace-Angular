import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';


@Component({
  selector: 'app-online-friends',
  imports: [CommonModule],
  templateUrl: './online-friends.html',
  styleUrl: './online-friends.css'
})
export class OnlineFriends {
  friendsData: any = [
    { name: 'AliceCode', avatar: 'A', color: 'from-purple-500 to-indigo-600', status: 'online', activity: 'Playing Visual Studio Code' },
                { name: 'JohnGamer', avatar: 'J', color: 'from-emerald-500 to-green-600', status: 'online', activity: 'Playing Valorant' },
                { name: 'Mike_Dev', avatar: 'M', color: 'from-red-500 to-pink-600', status: 'dnd', activity: 'Busy coding' },
                { name: 'Sarah_Design', avatar: 'S', color: 'from-blue-500 to-cyan-600', status: 'idle', activity: 'Away - Working on designs' }
  ]

  startDM(name: any){

  }
  callFriend(name: any){

  }

  showFriendOptions(name: any){
    
  }
}
