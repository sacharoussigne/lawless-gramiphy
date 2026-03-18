export enum Role {
    VISITOR = "visitor",
    USER = "user",
    DJ = "dj",
    ADMIN = "admin",
}

export const rolesAsString = (role: Role): string => {
    switch (role) {
        case Role.VISITOR:
            return "Utilisateur";
        case Role.USER:
            return "Visiteur";
        case Role.DJ:
            return "DJ";
        case Role.ADMIN:
            return "Administrateur";
    }
};