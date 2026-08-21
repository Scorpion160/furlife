import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('fr')];

  /// No description provided for @appName.
  ///
  /// In fr, this message translates to:
  /// **'Furlife'**
  String get appName;

  /// No description provided for @tagline.
  ///
  /// In fr, this message translates to:
  /// **'Vos colis voyagent en confiance.'**
  String get tagline;

  /// No description provided for @signInTitle.
  ///
  /// In fr, this message translates to:
  /// **'Connexion sécurisée'**
  String get signInTitle;

  /// No description provided for @signInSubtitle.
  ///
  /// In fr, this message translates to:
  /// **'Entrez votre numéro de téléphone. Nous vous enverrons un code à usage unique.'**
  String get signInSubtitle;

  /// No description provided for @phoneLabel.
  ///
  /// In fr, this message translates to:
  /// **'Numéro de téléphone'**
  String get phoneLabel;

  /// No description provided for @phoneInvalid.
  ///
  /// In fr, this message translates to:
  /// **'Entrez un numéro au format international, par exemple +221771234567.'**
  String get phoneInvalid;

  /// No description provided for @sendCode.
  ///
  /// In fr, this message translates to:
  /// **'Recevoir mon code'**
  String get sendCode;

  /// No description provided for @signInPrivacy.
  ///
  /// In fr, this message translates to:
  /// **'Votre numéro sert à sécuriser votre compte et vos opérations Furlife.'**
  String get signInPrivacy;

  /// No description provided for @otpTitle.
  ///
  /// In fr, this message translates to:
  /// **'Entrez le code reçu'**
  String get otpTitle;

  /// No description provided for @otpSubtitle.
  ///
  /// In fr, this message translates to:
  /// **'Un code à 6 chiffres a été envoyé au {phone}.'**
  String otpSubtitle(String phone);

  /// No description provided for @otpLabel.
  ///
  /// In fr, this message translates to:
  /// **'Code à 6 chiffres'**
  String get otpLabel;

  /// No description provided for @verifyCode.
  ///
  /// In fr, this message translates to:
  /// **'Vérifier'**
  String get verifyCode;

  /// No description provided for @logout.
  ///
  /// In fr, this message translates to:
  /// **'Se déconnecter'**
  String get logout;

  /// No description provided for @connectedAs.
  ///
  /// In fr, this message translates to:
  /// **'Connecté avec {phone}'**
  String connectedAs(String phone);

  /// No description provided for @sendParcel.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer un colis'**
  String get sendParcel;

  /// No description provided for @sendParcelSubtitle.
  ///
  /// In fr, this message translates to:
  /// **'Bientôt disponible dans le prochain incrément.'**
  String get sendParcelSubtitle;

  /// No description provided for @myParcels.
  ///
  /// In fr, this message translates to:
  /// **'Mes colis'**
  String get myParcels;

  /// No description provided for @myParcelsSubtitle.
  ///
  /// In fr, this message translates to:
  /// **'Le suivi sera activé après le module commande.'**
  String get myParcelsSubtitle;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'fr':
      return AppLocalizationsFr();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
