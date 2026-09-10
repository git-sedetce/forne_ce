import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { UserService } from '../../../services/user.service';

@Component({
  selector: 'app-header',
  standalone: false,
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit {
  menuAberto = false;
  authenticated: boolean = false;
  user_name: string = '';
  profile: number = 0;

  private sub!: Subscription;

  constructor(
    private router: Router,
    private serviceUser: UserService,
  ) {}

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    this.updateUserInfo(this.serviceUser.getUser());
    this.sub = this.serviceUser.user$.subscribe((user) => {
      this.updateUserInfo(user);
    });
  }

  alternarMenu(): void {
    this.menuAberto = !this.menuAberto;
  }

  fecharMenu(): void {
    this.menuAberto = false;
  }

  irParaLogin(): void {
    this.fecharMenu();
    this.router.navigate(['/login']);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 900) {
      this.menuAberto = false;
    }
  }

  updateUserInfo(user: any) {
    if (!user) {
      this.authenticated = false;
      this.user_name = '';
      this.profile = 0;
      return;
    }

    this.authenticated = true;
    this.user_name = user._user_name || user.name || '';
    this.profile = Number(user._profile_id || 0);
  }

  logout() {
    this.serviceUser.logout();
  }
}
