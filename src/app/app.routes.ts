import { Routes } from '@angular/router';
import { ServerComponent } from './components/server-component/server-component';
import { FriendsComponent } from './components/friends-component/friends-component';
import { AllFriendsComponent } from './components/all-friends-component/all-friends-component';
import { OnlineFriends } from './components/online-friends/online-friends';
import { PendingFriends } from './components/pending-friends/pending-friends';
import { AuthGuard } from './guards/auth.guard-guard';
import { MainComponent } from './components/main-component/main-component';
import { DMChatComponent } from './components/dmchat-component/dmchat-component';




export const routes: Routes = [
    {
        path: '',
        redirectTo: '/app/friends',
        pathMatch: 'full'
    },
    {
        path:'app',
        canActivate:[AuthGuard],
        component:MainComponent,
        children:[
            {
                 path:"friends",
                 component:FriendsComponent,
                 children:[
                    {
                         path:"all",
                         component: AllFriendsComponent
                    },
                    {
                          path:"online",
                          component: OnlineFriends
                    },
                    {   
                           path:"pending",
                           component:PendingFriends
                    },
                    {
                           path:"",
                           redirectTo:"/app/friends/all",
                           pathMatch:"full"
                    }
                 ]
            },
            {
                path:"server/:id",
                component:ServerComponent
            },
            {
                path:"dm/:userId",
                component:DMChatComponent
            },
            {
                path:"",
                redirectTo:"/app/friends/all",
                pathMatch:"full"
            }
        ]
    },
    {
        path: '**',
        redirectTo: '/app/friends'
    }
    
  
];
