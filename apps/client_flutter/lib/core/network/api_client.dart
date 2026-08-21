import 'package:client_flutter/core/config/app_config.dart';
import 'package:client_flutter/core/network/api_exception.dart';
import 'package:dio/dio.dart';

class ApiClient {
  ApiClient(AppConfig config)
      : _dio = Dio(
          BaseOptions(
            baseUrl: config.apiBaseUrl.toString(),
            connectTimeout: const Duration(seconds: 10),
            receiveTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 20),
            headers: const {'Accept': 'application/json'},
          ),
        );

  final Dio _dio;

  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, String>? headers,
  }) async {
    try {
      final response =
          await _dio.get<Object?>(path, options: Options(headers: headers));
      return _asJsonObject(response.data);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    try {
      final response = await _dio.post<Object?>(
        path,
        data: body,
        options: Options(headers: headers),
      );
      return _asJsonObject(response.data);
    } on DioException catch (error) {
      throw _mapError(error);
    }
  }

  Map<String, dynamic> _asJsonObject(Object? data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    throw const ApiException(
      code: 'INVALID_SERVER_RESPONSE',
      message: 'Réponse serveur inattendue.',
    );
  }

  ApiException _mapError(DioException error) {
    final data = error.response?.data;
    if (data is Map) {
      final rawError = data['error'];
      if (rawError is Map) {
        return ApiException(
          code: rawError['code']?.toString() ?? 'API_ERROR',
          message: _messageFrom(rawError['message']),
          statusCode: error.response?.statusCode,
        );
      }
    }

    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout) {
      return const ApiException(
        code: 'NETWORK_TIMEOUT',
        message: 'Le serveur met trop de temps à répondre.',
      );
    }
    if (error.type == DioExceptionType.connectionError) {
      return const ApiException(
        code: 'NETWORK_UNAVAILABLE',
        message: 'Connexion au service impossible. Vérifiez votre réseau.',
      );
    }

    return ApiException(
      code: 'NETWORK_ERROR',
      message: 'Une erreur réseau est survenue.',
      statusCode: error.response?.statusCode,
    );
  }

  String _messageFrom(Object? value) {
    if (value is String && value.isNotEmpty) return value;
    if (value is List && value.isNotEmpty) return value.first.toString();
    return 'La demande n’a pas pu être traitée.';
  }
}
