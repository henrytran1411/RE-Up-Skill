import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { MicrosoftProfile } from './strategies/microsoft.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Sends the browser to Microsoft's consent screen. The redirect itself is handled by the passport strategy — this method body never runs. */
  @Public()
  @Get('microsoft')
  @UseGuards(AuthGuard('microsoft'))
  microsoftLogin() {
    // Never reached — AuthGuard('microsoft') intercepts the request and redirects to Microsoft first.
  }

  /** Microsoft redirects here after consent; exchanges the profile for our own JWT, then hands off to the frontend's callback page. */
  @Public()
  @Get('microsoft/callback')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
    try {
      const result = await this.authService.loginWithMicrosoftProfile(req.user as MicrosoftProfile);
      res.redirect(`${frontendUrl}/auth/callback?token=${encodeURIComponent(result.accessToken)}`);
    } catch {
      res.redirect(`${frontendUrl}/login?error=microsoft_login_failed`);
    }
  }
}
