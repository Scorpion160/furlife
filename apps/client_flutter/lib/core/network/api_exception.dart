class ApiException implements Exception {
  const ApiException(
      {required this.code, required this.message, this.statusCode});

  final String code;
  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => 'ApiException($code, $statusCode): $message';
}
