import cookie from 'js-cookie';

export const fetchAuthImage = async (src) => {
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${cookie.get('serverToken')}`);
    const response = await fetch(src, { headers });
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}