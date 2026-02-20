// Copyright (c) 2025, 2026 Jon Verrier

import React from 'react';

export interface IUserProfile {
   userId: string;
   displayName: string;
   email: string;
   avatarUrl?: string;
}

interface IUserProfileCardProps {
   profile: IUserProfile;
   onEdit?: (userId: string) => void;
}

/**
 * Renders a user profile card showing the user's avatar, display name and email.
 * Optionally shows an edit button when an onEdit handler is provided.
 */
export function UserProfileCard({ profile, onEdit }: IUserProfileCardProps): React.ReactElement {
   return (
      <div className="user-profile-card">
         {profile.avatarUrl && (
            <img src={profile.avatarUrl} alt={`${profile.displayName} avatar`} />
         )}
         <h2>{profile.displayName}</h2>
         <p>{profile.email}</p>
         {onEdit && (
            <button onClick={() => onEdit(profile.userId)}>Edit Profile</button>
         )}
      </div>
   );
}

export default UserProfileCard;
