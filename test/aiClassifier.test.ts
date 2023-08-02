import { toAIClassifier } from '../src/aiClassifier'
import Debug from 'debug'
const debug = Debug('test')

describe('Build a magic AI classifier from an enum type', () => {
  test('it should infer the correct enum value', async () => {
    /** @description Customer web application routes */
    enum AppRouteEnum {
      USER_PROFILE = '/user-profile',
      SEARCH = '/search',
      NOTIFICATIONS = '/notifications',
      SETTINGS = '/settings',
      HELP = '/help',
      SUPPORT_CHAT = '/support-chat',
      DOCS = '/docs',
      PROJECTS = '/projects',
      WORKSPACES = '/workspaces',
    }
    const AppRoute = toAIClassifier<AppRouteEnum>()

    let appRouteRes: AppRouteEnum
    appRouteRes = await AppRoute('I need to talk to somebody about billing')
    debug(
      `Classification: AppRouteEnum:${appRouteRes} text:"I need to talk to somebody about billing"`,
    )
    expect(appRouteRes).toEqual(AppRouteEnum.SUPPORT_CHAT)

    appRouteRes = await AppRoute('I want to update my password')
    debug(`Classification: AppRouteEnum:${appRouteRes} text:"I want to update my password"`)
    expect(appRouteRes).toEqual(AppRouteEnum.SETTINGS)

    expect(AppRoute.prototype.description).toEqual('Customer web application routes')
  })
})
