class AppConfig {
  const AppConfig._({required this.apiBaseUrl, required this.environment});

  final Uri apiBaseUrl;
  final String environment;

  static AppConfig fromEnvironment() {
    const rawUrl = String.fromEnvironment('FURLIFE_API_BASE_URL');
    const env =
        String.fromEnvironment('FURLIFE_ENV', defaultValue: 'development');
    if (rawUrl.isEmpty) {
      throw StateError(
          'FURLIFE_API_BASE_URL must be provided with --dart-define');
    }
    final uri = Uri.parse(rawUrl);
    if (env == 'production' && uri.scheme != 'https') {
      throw StateError('Production API must use HTTPS');
    }
    return AppConfig._(apiBaseUrl: uri, environment: env);
  }
}
