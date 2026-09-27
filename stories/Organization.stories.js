import {organizationDashboard, organizationProfile} from './organization-page.mjs';
export default {title: 'Screens/Organization'};

// #overview is the default view; #repos and #activity are real in-page views this module renders.
// #prs/#issues never render a persisted view — the production module always routes them straight to
// the native `/pulls`/`/issues` aggregate pages (see organization.spec.mjs), so the only story-visible
// evidence of them is the tab bar itself, present in every dashboard state below.
export const Overview = {render: () => organizationDashboard()};
export const Repos = {render: () => organizationDashboard({view: 'repos'})};
export const Activity = {render: () => organizationDashboard({view: 'activity'})};
export const EmptyResults = {render: () => organizationDashboard({empty: true})};
export const Loading = {render: () => organizationDashboard({loading: true})};
export const ErrorState = {render: () => organizationDashboard({errorState: true})};
export const Dark = {render: () => organizationDashboard({dark: true})};
export const WithFlashAlert = {render: () => organizationDashboard({alert: true})};
export const Profile = {render: () => organizationProfile()};
export const ProfileDark = {render: () => organizationProfile({dark: true})};
