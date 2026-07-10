import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, MicrosoftStrategyOptions } from 'passport-microsoft';
import type { VerifyCallback } from 'passport-oauth2';

/** Normalized shape passport-microsoft builds from the Microsoft Graph /me response. */
export interface MicrosoftProfile {
  id: string;
  displayName: string;
  emails?: { type: string; value: string }[];
}

/** The npm package supports `addUPNAsEmail` at runtime; the community @types package hasn't caught up. */
type MicrosoftStrategyOptionsExtended = MicrosoftStrategyOptions & { addUPNAsEmail?: boolean };

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(configService: ConfigService) {
    // passport-oauth2 throws at construction time if clientID/clientSecret are falsy, which would
    // crash the whole app on boot before an Azure App Registration has been set up. Fall back to
    // inert placeholders so the server still starts; actually using this strategy without real
    // credentials just fails cleanly when someone hits the Microsoft login route.
    const options: MicrosoftStrategyOptionsExtended = {
      clientID: configService.get<string>('MICROSOFT_CLIENT_ID') || 'not-configured',
      clientSecret: configService.get<string>('MICROSOFT_CLIENT_SECRET') || 'not-configured',
      callbackURL: configService.get<string>('MICROSOFT_CALLBACK_URL', 'http://localhost:3000/api/auth/microsoft/callback'),
      tenant: configService.get<string>('MICROSOFT_TENANT', 'common'),
      scope: ['user.read'],
      // Personal Microsoft accounts (outlook.com, etc.) often have no `mail` claim —
      // fall back to userPrincipalName so we still get something email-shaped to sign in with.
      addUPNAsEmail: true,
    };
    super(options);
  }

  validate(_accessToken: string, _refreshToken: string, profile: MicrosoftProfile, done: VerifyCallback) {
    done(null, profile);
  }
}
