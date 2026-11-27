export function guildFollowState(isFollowing: boolean, isMember: boolean, isAdmin: boolean) {
  const membershipFollow = isMember || isAdmin;
  return { checked: isFollowing || membershipFollow, locked: membershipFollow };
}