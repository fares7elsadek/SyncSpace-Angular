import { Component, OnDestroy, OnInit } from '@angular/core';
import { ServerListComponent } from '../server-list-component/server-list-component';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { AppGlobalModal } from '../app-global-modal/app-global-modal';


@Component({
  selector: 'app-main-component',
  imports: [ServerListComponent,RouterOutlet,AppGlobalModal],
  templateUrl: './main-component.html',
  styleUrl: './main-component.css'
})
export class MainComponent{
 
}
