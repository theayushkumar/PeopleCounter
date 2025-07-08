import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomePage } from './home.page';
import { HomeOneComponent } from './home-one/home-one.component';
import { HomeTwoComponent } from './home-two/home-two.component';
import { HomeThreeComponent } from './home-three/home-three.component';
import { HomeFourComponent } from './home-four/home-four.component';

const routes: Routes = [
  {
    path: '',
    component: HomePage,
    children: [
      {
        path: 'homeone',
        component: HomeOneComponent,
      },
      {
        path: 'hometwo',
        component: HomeTwoComponent,
      },
      {
        path: 'homethree',
        component: HomeThreeComponent,
      },
      {
        path: 'homefour',
        component: HomeFourComponent,
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class HomePageRoutingModule {}
