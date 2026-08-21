class AppConfig {
  const AppConfig._({required this.apiBaseUrl, required this.environment});

  final Uri apiBaseUrl;
  final String environment;

  bool get isProduction => environment == 'production';

  static AppConfig fromEnvironment() {
    const rawUrl = String.fromEnvironment('FURLIFE_API_BASE_URL');
    const env =
        String.fromEnvironment('FURLIFE_ENV', defaultValue: 'development');
    if (rawUrl.isEmpty) {
      throw StateError(
          'FURLIFE_API_BASE_URL must be provided with --dart-define');
    }
    if (!const {'development', 'test', 'staging', 'production'}.contains(env)) {
      throw StateError('Unsupported FURLIFE_ENV: $env');
    }

    final parsed = Uri.tryParse(rawUrl);
    if (parsed == null || !parsed.hasScheme || parsed.host.isEmpty) {
      throw StateError('FURLIFE_API_BASE_URL must be an absolute URL');
    }
    if (parsed.userInfo.isNotEmpty) {
      throw StateError('API URL must not contain credentials');
    }
    if ((env == 'staging' || env == 'production') && parsed.scheme != 'https') {
      throw StateError('Staging/production API must use HTTPS');
    }

    final normalizedPath =
        parsed.path.endsWith('/') ? parsed.path : '${parsed.path}/';
    final uri = parsed.replace(path: normalizedPath);
    return AppConfig._(apiBaseUrl: uri, environment: env);
  }
}
