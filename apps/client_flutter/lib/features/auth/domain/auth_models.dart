import 'package:client_flutter/core/storage/token_store.dart';

class PendingPhoneChallenge {
  const PendingPhoneChallenge({
    required this.challengeId,
    required this.phoneE164,
    required this.expiresAt,
    required this.resendAvailableAt,
  });

  final String challengeId;
  final String phoneE164;
  final DateTime expiresAt;
  final DateTime resendAvailableAt;
}

class UserProfile {
  const UserProfile({
    required this.id,
    required this.phoneE164,
    required this.locale,
    required this.status,
    required this.roles,
  });

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String,
        phoneE164: json['phoneE164'] as String,
        locale: json['locale'] as String? ?? 'fr-SN',
        status: json['status'] as String,
        roles: (json['roles'] as List<dynamic>? ?? const [])
            .map((role) => role.toString())
            .toList(growable: false),
      );

  final String id;
  final String phoneE164;
  final String locale;
  final String status;
  final List<String> roles;
}

class AuthSession {
  const AuthSession({required this.tokens, required this.user});

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        tokens: StoredTokens(
          accessToken: json['accessToken'] as String,
          refreshToken: json['refreshToken'] as String,
          accessExpiresAt: DateTime.parse(json['accessExpiresAt'] as String),
          refreshExpiresAt: DateTime.parse(json['refreshExpiresAt'] as String),
        ),
        user: UserProfile.fromJson(
            Map<String, dynamic>.from(json['user'] as Map)),
      );

  final StoredTokens tokens;
  final UserProfile user;
}
